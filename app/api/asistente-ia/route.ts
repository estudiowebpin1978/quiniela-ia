/**
 * Asistente de Análisis (Groq) — endpoint para la card "Asistente IA" en
 * /rendimiento.
 *
 * Funciona con contexto frío cargado server-side desde `draws` — no se exponen
 * keys ni datos de otros usuarios. Rate-limited por IP. Es fail-soft:
 *   - Sin `GROQ_API_KEY`      → 503 { ok:false, error }
 *   - Groq caído/cuota agotada → 502 { ok:false, error }
 *   - Historial sin datos      → 200 { ok:true, respuesta } (dijo la palabra)
 *
 * El contexto se arma como bullet list para telas de información del día de
 * hoy (ART) + frecuencias reales por turno. Nunca inventa: si la pregunta exige
 * datos que no están en el contexto, el system prompt ordena decirlo así.
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

function term2(n: number): number {
  const v = Math.trunc(Math.abs(n)) % 100
  return v
}

function topFreq<T>(bucket: Map<T, number>, k: number): Array<[T, number]> {
  return [...bucket.entries()].sort((a, b) => b[1] - a[1]).slice(0, k)
}

async function cargarContexto(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<string> {
  const { data, error } = await supabase
    .from("draws")
    .select("date, turno, numbers, jurisdiccion")
    .order("date", { ascending: false })
    .limit(400)

  if (error) {
    logger.warn("[asistente] draws query failed", { error: error.message })
  }

  const rows = Array.isArray(data) ? data : []

  // Agrupar por turno respetando jurisdicción CABA/Ciudad
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

  const terminologyLine =
    "Referencia de terminos por turno (muestra sobre los ultimos sorteos validos del historial, solo terminales de 2 cifras salvo que se diga lo contrario):\n"
  const lines: string[] = []
  lines.push(`HOY (ART): ${hoyArt()}`)
  lines.push("HORARIOS OFICIALES (ART): Previa 10:30 | Primera 12:30 | Matutina 15:00 | Vespertina 18:30 | Nocturna 21:30 | Poceada 21:15")
  lines.push(terminologyLine.trim())

  for (const turno of TURNOS) {
    const bucket = byTurno.get(turno)?.slice(0, MAX_TURNO_DRAWS) ?? []
    if (bucket.length === 0) {
      lines.push(`- ${turno}: sin datos historicos en la muestra.`)
      continue
    }
    const termCount = new Map<number, number>()
    const exactCount = new Map<number, number>()
    const perDraw = bucket.length
    for (const d of bucket) {
      const seenT = new Set<number>()
      for (const n of d.numbers) {
        const t = term2(Number(n))
        if (Number.isFinite(t)) {
          if (!seenT.has(t)) {
            termCount.set(t, (termCount.get(t) ?? 0) + 1)
            seenT.add(t) // evita doble conteo de la misma terminal dentro de un sorteo
          }
        }
        const e = Number(n)
        if (Number.isFinite(e) && e >= 0) exactCount.set(e, (exactCount.get(e) ?? 0) + 1)
      }
    }
    const hotTerm = topFreq(termCount, 8)
      .map(([t, c]) => `${String(t).padStart(2, "0")}(${c})`)
      .join(", ")
    const coldTerm = [...Array(100).keys()]
      .map((t) => ({ t, c: termCount.get(t) ?? 0 }))
      .sort((a, b) => a.c - b.c || a.t - b.t)
      .slice(0, 8)
      .map(({ t, c }) => `${String(t).padStart(2, "0")}(${c})`)
      .join(", ")
    const hotExact = topFreq(exactCount, 5)
      .map(([e, c]) => `${e}(${c})`)
      .join(", ")
    lines.push(`- ${turno} (ultimos ${perDraw} sorteos): terminales mas frecuentes: ${hotTerm}`)
    lines.push(`   terminales menos frecuentes: ${coldTerm}`)
    lines.push(`   numeros exactos mas repetidos: ${hotExact}`)
  }

  return lines.join("\n")
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

  const key = process.env.GROQ_API_KEY
  if (!key) {
    return NextResponse.json({ ok: false, error: "Asistente IA no configurado (falta GROQ_API_KEY)." }, { status: 503 })
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
  const contexto = await cargarContexto(supabase).catch((e) => {
    logger.warn("[asistente] contexto build failed", { error: String(e) })
    return "Sin contexto historico disponible en este momento."
  })

  let res: Response
  try {
    res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.3,
        max_tokens: 650,
        reasoning_effort: "low",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "system", content: `CONTEXTO (historial validado):\n${contexto}` },
          { role: "user", content: pregunta },
        ],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
  } catch (e) {
    logger.warn("[asistente] Groq request failed", { error: String(e) })
    return NextResponse.json({ ok: false, error: "El asistente no responde en este momento." }, { status: 502 })
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    logger.warn("[asistente] Groq HTTP error", { status: res.status, short: txt.slice(0, 200) })
    return NextResponse.json({ ok: false, error: "El asistente no está disponible (cuota o error del proveedor)." }, { status: 502 })
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Respuesta malformada del asistente." }, { status: 502 })
  }

  const respuesta =
    (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content?.trim() ?? ""

  if (!respuesta) {
    return NextResponse.json({ ok: false, error: "El asistente no devolvio contenido." }, { status: 502 })
  }

  return NextResponse.json({ ok: true, respuesta, modelo: MODEL, frescura: hoyArt() })
}
