/**
 * Asistente de Análisis — endpoint para la card "Asistente IA" en /rendimiento.
 *
 * Contexto: tejido frío cargado server-side desde `draws` (solo columnas
 * necesarias). Tres capas de degradación graceful, sin romper la vista:
 *   1. `GROQ_API_KEY` válida → responde Groq (reasoning bajo).
 *   2. Groq falla / sin clave → responde `respuestaDeterministica` (misma data,
 *      resumen pre-calculado) con 200 {source:"deterministico"}.
 *   3. La base está vacía → responde texto fijo ("sin historial disponible")
 *      con 200 {estado:"sin_datos"}.
 *
 * Rate-limited por IP. Ninguna excepción viaja al cliente.
 */
import { NextRequest, NextResponse } from "next/server"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { jurisParaTurno } from "@/lib/procedencia"
import logger from "@/lib/logger"

export const maxDuration = 30

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b"
const FETCH_TIMEOUT = 25_000
const MAX_PREGUNTA = 500
const MAX_TURNO_DRAWS = 25

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const
type Turno = (typeof TURNOS)[number]

function hoyArt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
}
function term2(n: number): number { return Math.trunc(Math.abs(n)) % 100 }
function topFreq(bucket: Map<number, number>, k: number): Array<[number, number]> {
  return [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
}

interface DatosHistorial {
  texto: string           // bullet list para el LLM
  deterministico: string  // respuesta exacta con la misma data
  tieneDatos: boolean
}

async function cargarDatos(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<DatosHistorial> {
  const { data, error } = await supabase
    .from("draws")
    .select("date, turno, numbers, jurisdiccion")
    .order("date", { ascending: false })
    .limit(400)

  if (error) logger.warn("[asistente] draws query failed", { error: error.message })

  const rows = Array.isArray(data) ? data : []
  const byTurno = new Map<Turno, Array<{ date: string; numbers: number[] }>>()
  for (const r of rows) {
    const turno = (r as { turno?: string }).turno as Turno
    if (!TURNOS.includes(turno)) continue
    const nums = Array.isArray((r as { numbers?: unknown }).numbers) ? ((r as { numbers: number[] }).numbers) : []
    if (nums.length < 20) continue
    const juris = (r as { jurisdiccion?: string }).jurisdiccion ?? ""
    if (juris && !jurisParaTurno(turno).some((j) => j.toLowerCase() === juris.toLowerCase())) continue
    const bucket = byTurno.get(turno) ?? []
    bucket.push({ date: (r as { date?: string }).date ?? "", numbers: nums })
    byTurno.set(turno, bucket)
  }

  const HOY = hoyArt()
  const bodyLines: string[] = []
  const resumenLines: string[] = []
  let tieneDatos = false
  for (const turno of TURNOS) {
    const bucket = byTurno.get(turno)?.slice(0, MAX_TURNO_DRAWS) ?? []
    if (bucket.length === 0) {
      resumenLines.push(`• ${turno}: sin datos en la muestra.`)
      bodyLines.push(`- ${turno}: sin datos historicos en la muestra.`)
      continue
    }
    tieneDatos = true
    const termCount = new Map<number, number>()
    const exactCount = new Map<number, number>()
    for (const d of bucket) {
      const seenT = new Set<number>()
      for (const n of d.numbers) {
        const t = term2(Number(n))
        if (Number.isFinite(t)) {
          if (!seenT.has(t)) {
            termCount.set(t, (termCount.get(t) ?? 0) + 1)
            seenT.add(t)
          }
        }
        const e = Number(n)
        if (Number.isFinite(e) && e >= 0) exactCount.set(e, (exactCount.get(e) ?? 0) + 1)
      }
    }
    const hotTerm = topFreq(termCount, 8).map(([t, c]) => `${String(t).padStart(2, "0")}(${c})`).join(", ")
    const coldTerm = [...Array(100).keys()]
      .map((t) => ({ t, c: termCount.get(t) ?? 0 }))
      .sort((a, b) => a.c - b.c || a.t - b.t)
      .slice(0, 8)
      .map(({ t, c }) => `${String(t).padStart(2, "0")}(${c})`)
      .join(", ")
    const hotExact = topFreq(exactCount, 5).map(([e, c]) => `${e}(${c})`).join(", ")
    bodyLines.push(`- ${turno} (ultimos ${bucket.length} sorteos): terminales mas frecuentes: ${hotTerm}`)
    bodyLines.push(`   terminales menos frecuentes: ${coldTerm}`)
    bodyLines.push(`   numeros exactos mas repetidos: ${hotExact}`)
    resumenLines.push(`• ${turno}: terminales calientes: ${hotTerm} | fríos: ${coldTerm}`)
  }

  const texto = [
    `HOY (ART): ${HOY}`,
    "HORARIOS OFICIALES (ART): Previa 10:30 | Primera 12:30 | Matutina 15:00 | Vespertina 18:30 | Nocturna 21:30 | Poceada 21:15",
    "Referencia de terminos (muestra sobre los ultimos sorteos validos, solo terminales de 2 cifras salvo que se diga lo contrario):",
    ...bodyLines,
  ].join("\n")

  const deterministico = [
    `Análisis del historial validado (HOY ${HOY}):`,
    "",
    ...resumenLines,
    "",
    "(Estadísticas históricas. Ofrece patrón de tendencia, no garantiza resultado.)",
  ].join("\n")

  return { texto, deterministico, tieneDatos }
}

const SYSTEM_PROMPT =
  "Eres un consultor de analisis estadistico para una quiniela argentina.\n" +
  "- Trabaja EXCLUSIVAMENTE con el contexto que se te da. No inventes sorteos ni numeros que no esten en el contexto; si el usuario pide algo que no esta, decis 'no tengo ese dato en la muestra'.\n" +
  "- Responde en espanol rioplatense, maximo 120 palabras. Se breve pero concreto; usa listas si ayuda.\n" +
  "- Si se pregunta por prediccion de numeros, aclarate que son estadisticas historicas y no garantizan resultado.\n" +
  "- No animes a apostar mas de lo que uno pueda perder.\n"

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rl = await checkRateLimit(`ai-assistant:${ip}`, RATE_LIMIT_PRESETS.GENERAL_API)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: "Demasiadas consultas. Espera un minuto." }, { status: 429 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 })
  }

  const pregunta = String((payload as { pregunta?: unknown })?.pregunta ?? "").trim()
  if (pregunta.length < 3) {
    return NextResponse.json({ ok: false, error: "Pregunta demasiado corta." }, { status: 400 })
  }
  if (pregunta.length > MAX_PREGUNTA) {
    return NextResponse.json({ ok: false, error: `Pregunta demasiado larga (max ${MAX_PREGUNTA}).` }, { status: 400 })
  }

  const supabase = getSupabaseAdmin()
  const datos = await cargarDatos(supabase).catch((e) => {
    logger.warn("[asistente] datos build failed", { error: String(e) })
    return null
  })
  const base = datos?.deterministico ?? "Sin historial disponible en este momento."
  const tieneDatos = datos?.tieneDatos ?? false

  const key = process.env.GROQ_API_KEY
  if (!key || !tieneDatos) {
    // Sin proveedor o sin datos: respuesta determinista (siempre 200 si hay datos)
    return NextResponse.json({
      ok: true,
      respuesta: tieneDatos ? base : "No tengo datos suficientes en el historial para responder.",
      modelo: "deterministico",
      frescura: hoyArt(),
      fallback: true,
    })
  }

  // Intenta Groq; ante cualquier fallo devuelve determinístico directo
  let respuesta = ""
  let modelo = MODEL
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 650,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `CONTEXTO (historial validado):\n${datos?.texto}` },
          { role: "user", content: pregunta },
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })

    if (!res.ok) {
      const txt = await res.text().catch(() => "")
      logger.warn("[asistente] Groq HTTP error", { status: res.status, short: txt.slice(0, 200) })
      throw new Error(`groq_http_${res.status}`)
    }
    const data = await res.json()
    const raw =
      (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content?.trim() ?? ""
    if (!raw) throw new Error("respuesta_vacia")
    respuesta = raw
  } catch (e) {
    logger.warn("[asistente] groq fallback deterministic", { error: String(e) })
    return NextResponse.json({
      ok: true,
      respuesta: base,
      modelo: "deterministico",
      frescura: hoyArt(),
      fallback: true,
    })
  }

  return NextResponse.json({ ok: true, respuesta, modelo, frescura: hoyArt(), fallback: false })
}
