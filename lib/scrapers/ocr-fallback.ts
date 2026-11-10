/**
 * OCR fallback para extractores oficiales de LOTBA.
 *
 * Cuando `extractResultadosData` y la rutina normal no logran leer los 20
 * números (p. ej. el site oficial cambió el formato de las tablas o publi-
 * cou el sorteo en PDF), se pide a Gemini Flash que extraiga los números
 * directamente del HTML resultante, como una cadena de medición alternativa.
 *
 * Se tratta como fail-soft: sin clave ni contenido đủ return null y el flujo
 * anterior proseguirá (consensus abortará graceful). Ninguna excepción
 * propagada.
 */
import logger from "@/lib/logger"

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_HTML = 100_000
const PARSE_TIMEOUT = 25_000

function htmlMetrics(html: string): boolean {
  if (!html || html.length < 600) return false
  // Una página vacía/placeholder no aporta nada de datos numéricos
  const digitGroups = (html.match(/\d{2,4}/g) ?? []).length
  return digitGroups >= 25
}

interface ExtractOpts {
  kind: "quiniela" | "poceada"
  sorteo?: number | null
  fechaISO?: string
  turno?: string
}

/**
 * Pide a Gemini Flash que le dé los 20 números correspondientes al sorteo.
 * - Retorna null cuando no hay clave, cuando el HTML carece de métricas o cuando
 *   el modelo se niega a responder.
 * - Rechaza respuestas con más/menos de 20 números válidos, evitando que un
 *   stub grosero se dispare en la pipeline.
 */
export async function extraerNumerosConGemini(
  html: string,
  opts: ExtractOpts
): Promise<number[] | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) {
    logger.info("[ocr] GEMINI_API_KEY ausente, fallback desactivado", { kind: opts.kind })
    return null
  }
  if (!htmlMetrics(html)) {
    logger.warn("[ocr] HTML insuficiente para OCR, se omite", { kind: opts.kind })
    return null
  }

  const range = opts.kind === "quiniela" ? 9999 : 99

  const prompt =
    "EXTRAE los 20 números del sorteo procedente de la página HTML. Responde EXCLUSIVAMENTE en el formato siguiente:\n\nNUMBERS: n1,n2,...,n20\nSi la página NO tiene los 20 números o no los leés con seguridad respondé EXCLUSIVAMENTE:\n\nNUMBERS: NONE\n\nReglas:\n" +
    `${opts.kind === "quiniela" ? "- Jurisdicción CABA (51). Los números son 4 dígitos entre 0000 y 9999; leé valores con ceros a la izquierda como enteros (ej. \"0743\" → 743).\n" : "- El juego es Poceada; los 20 números vienen en el juego Tradicional como valores de 2 dígitos entre 00 y 99.\n"}- Formato de salida: NUMBERS: n1,n2,...,n20 (exactamente 20 enteros separados por coma).\n`

  let res: Response
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { text: `<HTML>\n${html.slice(0, MAX_HTML)}</HTML>` }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 300 },
      }),
      signal: AbortSignal.timeout(PARSE_TIMEOUT),
    })
  } catch (e) {
    logger.warn("[ocr] request Gemini failed", { error: String(e), kind: opts.kind })
    return null
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => "")
    logger.warn("[ocr] Gemini HTTP error", { status: res.status, kind: opts.kind, short: txt.slice(0, 200) })
    return null
  }

  let data: unknown
  try {
    data = await res.json()
  } catch {
    logger.warn("[ocr] Gemini response parse failed", { kind: opts.kind })
    return null
  }

  const cand = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts
  const text =
    Array.isArray(cand) && cand.length > 0
      ? cand
          .map((p) => (typeof p?.text === "string" ? p.text : ""))
          .join("\n")
      : ""

  const m = text.match(/NUMBERS:\s*([0-9,\s]+|NONE)/i)
  if (!m || /NONE/i.test(m[1])) {
    logger.info("[ocr] Gemini reportó NONE/ausencia de numbers", { kind: opts.kind })
    return null
  }
  if (!m[1].trim()) return null

  const ints = m[1]
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= range)

  if (ints.length !== 20) {
    logger.warn("[ocr] Gemini devolvió conteo inválido", { count: ints.length, kind: opts.kind, range })
    return null
  }

  logger.info("[ocr] Gemini extrajo 20 números", { kind: opts.kind, sorteo: opts.sorteo ?? null })
  return ints
}
