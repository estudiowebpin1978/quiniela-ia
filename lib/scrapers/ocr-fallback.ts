/**
 * OCR fallback para extractores oficiales de LOTBA — todo el trabajo pesado
 * hace NADA de pago: Tesseract.js solo con flag OCR_TESSERACT=1, y sólo al final Gemini.
 *
 * Capas (FAIL-SOFT, ninguna excepción se propaga):
 *   1. extraerNumerosConTesseract  → solo <img> con numeros reales, flag OCR_TESSERACT=1
 *   2. extraerNumerosConTesseract  → <img> del HTML, tesseract.js (lazy)
 *   3. extraerNumerosConGemini     → último recurso, sólo si hay GEMINI_API_KEY
 *
 * Todas retornan null cuando no pueden completar 20 números; el flujo de
 * `lotba-oficial` las usa como fallback cuando el parser oficial devuelve
 * <20 números.
 */
import logger from "@/lib/logger"

const GEMINI_MODEL = "gemini-2.5-flash"
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_HTML = 100_000
const PARSE_TIMEOUT = 25_000
const IMG_TIMEOUT = 20_000
const MAX_IMGS = 3
const MAX_IMGBYTES = 5 * 1024 * 1024

interface ExtractOpts {
  kind: "quiniela" | "poceada"
  sorteo?: number | null
  fechaISO?: string
  turno?: string
}

function rangeForKind(kind: "quiniela" | "poceada"): number {
  return kind === "quiniela" ? 9999 : 99
}

function htmlMetrics(html: string): boolean {
  if (!html || html.length < 600) return false
  const digitGroups = (html.match(/\d{2,4}/g) ?? []).length
  return digitGroups >= 25
}

/** Sustrae spans de tags y ruido de markup para dejar texto visible. */
function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/&\w+;/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Mira el contexto previo de un token para filtrar números de formato no-sorteo (fechas, años). */
function contextLengthBefore(text: string, index: number): number {
  const start = Math.max(0, index - 6)
  const slice = text.slice(start, index).trim()
  return slice.length
}

/**
 * 1. Extrae números puros del texto visible.
 *    Estrategia: quita datos de fechas (20XX/DD/MM) y prendas de formato popular.
 *    Devuelve 20 enteros si puede, null ante cualquier ambigüedad.
 */
/** Flag: OCR de imagenes solo si el operador lo habilita (OCR_TESSERACT=1). */
export async function extraerNumerosConTesseract(
  html: string,
  opts: ExtractOpts
): Promise<number[] | null> {
  if (process.env.OCR_TESSERACT !== "1") return null
  return extraerNumerosConTesseractCore(html, opts)
}

/** 2. Tesseract.js sobre las imagenes del HTML (lazy,5MB límite). */
async function extraerNumerosConTesseractCore(
  html: string,
  opts: ExtractOpts
): Promise<number[] | null> {
  const limit = rangeForKind(opts.kind)
  const imgSrcs = Array.from(
    html.matchAll(/<img\b[^>]*src="([^"]+)"/gi),
    (m) => m[1]
  ).filter((src) => /^https?:\/\//i.test(src))

  if (imgSrcs.length === 0) return null

  let mod: unknown
  try {
    mod = await import("tesseract.js")
  } catch (e) {
    logger.warn("[ocr] tesseract.js no disponible, fallback de imágenes desactivado", { error: String(e) })
    return null
  }

  const createWorker = (mod as Partial<{ createWorker: (langs: string) => Promise<{ recognize: (img: Buffer) => Promise<{ data?: { text?: string } }>; terminate: () => Promise<void> }> }>).createWorker
  if (typeof createWorker !== "function") return null

  let worker
  try {
    worker = await createWorker("spa+eng")
  } catch (e) {
    logger.warn("[ocr] tesseract worker no pudo iniciar", { error: String(e) })
    return null
  }

  const nums: number[] = []
  try {
    for (const src of imgSrcs.slice(0, MAX_IMGS)) {
      try {
        const res = await fetch(src, { signal: AbortSignal.timeout(IMG_TIMEOUT) })
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length > MAX_IMGBYTES) continue
        const out = await worker.recognize(buf)
        const text = out?.data?.text ?? ""
        for (const m2 of text.matchAll(/\b\d{2,4}\b/g)) {
          const n = parseInt(m2[0], 10)
          if (Number.isInteger(n) && n >= 0 && n <= limit) nums.push(n)
          if (nums.length >= 20) break
        }
        if (nums.length >= 20) break
      } catch (e) {
        logger.warn("[ocr] tesseract img fetch failed", { error: String(e) })
      }
    }
  } finally {
    try {
      await worker.terminate()
    } catch {
      /* noop */
    }
  }

  if (nums.length !== 20) return null
  logger.info("[ocr] tesseract extrajo 20 números", { kind: opts.kind })
  return nums
}

/**
 * 3. Gemini Flash último recurso (misma lógica antigua).
 *    Sin GEMINI_API_KEY -> null (graceful degradation).
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

  const range = rangeForKind(opts.kind)
  const prompt =
    "EXTRAE los 20 números del sorteo procedente de la página HTML. Responde EXCLUSIVAMENTE en el siguiente formato:\n\nNUMBERS: n1,n2,...,n20\nSi la página NO tiene los 20 números o no los leíste con seguridad respondé EXCLUSIVAMENTE:\n\nNUMBERS: NONE\n\nReglas:\n" +
    `${opts.kind === "quiniela" ? "- Jurisdicción CABA (51). Los números son 4 dígitos entre 0000 y 9999; lee valores con ceros a la izquierda como enteros (ej. \"0743\" -> 743).\n" : "- El juego es Poceada; los 20 números vienen en el juego Tradicional como valores de 2 dígitos entre 00 y 99.\n"}- Formato de salida: NUMBERS: n1,n2,...,n20 (exactamente 20 enteros separados por coma).\n`

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

  interface GeminiResp {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const typed = data as GeminiResp | null | undefined
  const cand = typed?.candidates?.[0]?.content?.parts
  const text =
    Array.isArray(cand) && cand.length > 0
      ? cand.map((p) => (typeof p?.text === "string" ? p.text : "")).join("\n")
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

/**
 * Pila gratuita (sin proveedores): OCR_TESSERACT=1 solo con imágenes del extracto${" "}
 * último recurso. Retorna null cuando ninguna capa completa 20 enteros.
 */
export async function extraerNumerosGratis(
  html: string,
  opts: ExtractOpts
): Promise<number[] | null> {
  // Evidencia de imagenes con numeros? (solo entonces Tesseract)
  const tess = await extraerNumerosConTesseract(html, opts).catch(() => null)
  return tess
}

/**
 * Entry point único: primero la pila gratuita (Tesseract solo con flag),
 * y sólo si no completa 20 números, Gemini como último recurso.
 */
export async function extraerConPila(
  html: string,
  opts: ExtractOpts
): Promise<number[] | null> {
  const gratis = await extraerNumerosGratis(html, opts).catch(() => null)
  if (gratis) {
    logger.info("[ocr] extracción local OSS suficiente", { kind: opts.kind, sorteo: opts.sorteo ?? null })
    return gratis
  }
  return await extraerNumerosConGemini(html, opts).catch(() => null)
}
