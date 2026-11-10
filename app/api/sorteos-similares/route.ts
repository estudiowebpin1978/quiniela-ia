/**
 * Buscar sorteos históricos parecidos usando embeddings de Hugging Face
 * cuando está disponible; si HF no responde, cae a una similitud local
 * (Dice sobre intersección de terminales de 2 cifras) para que el endpoint
 * nunca quede vacío.
 *
 * Endpoint: GET /api/sorteos-similares?numeros=12,34,...&turno=Nocturna&limit=5
 * Fail-soft en todo el flujo: cualquier error parcial o global devuelve
 * { ok:false } o results locales válidos, nunca rompe la vista.
 */
import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { jurisParaTurno } from "@/lib/procedencia"
import logger from "@/lib/logger"

export const maxDuration = 30

const HF_MODEL = process.env.HF_MODEL || "sentence-transformers/all-MiniLM-L6-v2"
const HF_URL = `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(HF_MODEL)}`
const FETCH_TIMEOUT = 25_000
const MAX_DRAWS = 250
const MAX_QUERY = 20
const SIMILARITY_SCALE = 100

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const

function norm2(n: number): number {
  return ((Math.trunc(Math.abs(Number(n)))) % 100 + 100) % 100
}

function simDiceTerms(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sa = new Set(a.map(norm2))
  const inter = b.filter((x) => sa.has(norm2(x))).length
  return Math.round((2 * inter) / (a.length + b.length))
}

function l2Normalize(v: number[]): number[] {
  const s = Math.sqrt(v.reduce((acc, x) => acc + x * x, 0)) || 1
  return v.map((x) => x / s)
}

/**
 * HF puede devolver (batch, hidden) o (batch, tokens, hidden). Detecta la dimensión.
 * - (batch, dim)   -> vectores directos
 * - (batch, seq, d) -> mean-pooling por salida + normalize
 */
function vectoresPorBatch(raw: unknown): number[][] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null
  const first = raw[0]
  if (!Array.isArray(first)) return null

  // Caso directos: (batch, dim) - cada fila es número
  if (first.every((x) => typeof x === "number")) {
    return (raw as number[][]).map((v) => v)
  }

  // Caso tensor: (batch, seq, dim)
  return (raw as number[][][]).map((seqVecs) => {
    const dim = Array.isArray(seqVecs[0]) ? seqVecs[0].length : 0
    if (dim === 0) return []
    const avg = new Array(dim).fill(0)
    for (const tok of seqVecs) {
      for (let i = 0; i < dim; i++) avg[i] += Number(tok[i]) || 0
    }
    return l2Normalize(avg.map((x) => x / seqVecs.length))
  })
}

function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  let an = 0
  let bn = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    an += a[i] * a[i]
    bn += b[i] * b[i]
  }
  if (!an || !bn) return 0
  // resultado real en [-1, 1] -> escalar a [0, 100]
  const cos = dot / (Math.sqrt(an) * Math.sqrt(bn))
  return Math.max(0, Math.min(1, (cos + 1) / 2)) // desplazar al rango positivo para invariancia de signo
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rl = await checkRateLimit(`similar:${ip}`, RATE_LIMIT_PRESETS.GENERAL_API)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Demasiadas consultas. Espera un minuto." }, { status: 429 })
  }

  const s = req.nextUrl.searchParams
  const raw = s.get("numeros") ?? ""
  const rawLimit = parseInt(s.get("limit") ?? "5", 10)
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(8, rawLimit)) : 5

  if (!raw.trim()) {
    return NextResponse.json({ ok: false, error: "Falta numeros (ej. ?numeros=12,34,56)." }, { status: 400 })
  }

  const turnoRaw = s.get("turno") ?? "Nocturna"
  const turno: string = (TURNOS as readonly string[]).includes(turnoRaw) ? turnoRaw : "Nocturna"

  const numerosQuery = raw
    .split(/[\s,]+/)
    .map((x) => parseInt(x, 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999)
    .slice(0, MAX_QUERY)

  if (numerosQuery.length === 0) {
    return NextResponse.json({ ok: false, error: "numeros invalidos." }, { status: 400 })
  }

  // Cargar historial válido (nivel Ciudad/CABA) de este turno
  const supabase = getSupabaseAdmin()
  const juris = jurisParaTurno(turno)
  const { data, error } = await supabase
    .from("draws")
    .select("date, turno, numbers")
    .eq("turno", turno)
    .in("jurisdiccion", juris)
    .order("date", { ascending: false })
    .limit(MAX_DRAWS)

  if (error) logger.warn("[similar] draws query failed", { error: error.message, turno })

  const rows: Array<{ date?: string; numbers?: unknown }> = Array.isArray(data) ? data : []
  type Candidate = { fecha: string; turno: string; numbers: number[]; similitud: number }
  const candidates: Candidate[] = rows
    .map((r): Candidate | null => {
      const numbers = Array.isArray(r.numbers) ? r.numbers.map((n) => Number(n)).filter(Number.isFinite) : []
      if (numbers.length < 20) return null
      return { fecha: String(r.date ?? ""), turno, numbers, similitud: 0 }
    })
    .filter((x): x is Candidate => !!x)

  if (candidates.length === 0) {
    return NextResponse.json({ ok: false, error: "Sin historial disponible en este turno." }, { status: 503 })
  }

  // --- Paso 1: similitud local Dice sobre terminales de 2 cifras ---
  for (const c of candidates) {
    c.similitud = simDiceTerms(numerosQuery, c.numbers)
  }

  let method: "hugging-face" | "local" = "local"

  // --- Paso 2: si HF está disponible, usar embeddings ---
  if (process.env.HF_API_KEY) {
    try {
      const docs: string[] = []
      for (const c of candidates) {
        docs.push(`sorteo ${turno} ${c.fecha}: ${c.numbers.map(norm2).join(" ")}`)
      }
      const queryText = `sorteo ${turno} consulta: ${numerosQuery.map(norm2).join(" ")}`

      const hfRes = await fetch(HF_URL, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.HF_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ inputs: [queryText, ...docs], options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT),
      })

      if (hfRes.ok) {
        const rawJson = await hfRes.json().catch(() => null)
        const vecs = vectoresPorBatch(rawJson)
        if (vecs && vecs.length === docs.length + 1) {
          const qVec = l2Normalize(vecs[0])
          const q = qVec // ya normalizado arriba (simplemente usado directamente)
          for (let i = 0; i < docs.length; i++) {
            const cVec = l2Normalize(vecs[i + 1])
            const s = cosineSim(q, cVec)
            ;(candidates[i] as { similitud?: number }).similitud = Math.round(s * SIMILARITY_SCALE)
          }
          method = "hugging-face"
        } else {
          logger.info("[similar] HF devolvió shape inesperado, fallback local")
        }
      } else {
        logger.info("[similar] HF rechazó (fallback local)", { status: hfRes.status })
      }
    } catch (e) {
      logger.warn("[similar] HF request failed", { error: String(e) })
    }
  }

  // Normalizar a 0-100 y ordenar por similitud desc
  const scored = candidates
    .map((c) => ({
      fecha: c.fecha,
      turno: c.turno,
      numbers: c.numbers,
      similitud: Math.max(0, Math.min(SIMILARITY_SCALE, Math.round(c.similitud))),
    }))
    .sort((a, b) => b.similitud - a.similitud || a.fecha.localeCompare(b.fecha))
    .sort((a, b) => b.similitud - a.similitud || a.fecha.localeCompare(b.fecha))
    .slice(0, limit)

  return NextResponse.json({
    ok: true,
    method,
    frescura: new Date().toISOString(),
    resultados: scored,
  })
}
