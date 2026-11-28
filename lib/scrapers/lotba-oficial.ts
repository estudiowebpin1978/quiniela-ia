/**
 * LOTBA Official Scraper — única fuente autorizada de datos.
 *
 * Quiniela (nacional/CABA, 5 turnos):
 *   - Lista de sorteos: https://quiniela.loteriadelaciudad.gob.ar/index.php  (HTML)
 *     → "25/09/2026 - 18:00 - Sorteo Nº 52955 - VESPERTINA"
 *   - Números: https://quiniela.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=N
 *     → window.RESULTADOS_DATA = [{ sorteo, fecha, jurisdicciones: { "51": { numeros: [{val:"5791"}] } } }]
 *
 * Frío/hard-failure de un endpoint no rompe el pipeline: devuelve null y el
 * llamador decide (retry posterior / esperar próximo cron).
 */

import logger from "@/lib/logger"
import type { TurnoType } from "./types"
import { extraerConPila as extraerNumerosConGemini } from "./ocr-fallback"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 12000

const QUINIELA_BASE = "https://quiniela.loteriadelaciudad.gob.ar"

export const SOURCE_LOTBA = "lotba-oficial"

// Caché de listas de sorteos (TTL corto: el sorteo de turno recién publicado
// debe verse rápido, pero evita re-fetch por cada turno dentro del mismo cron)
interface CachedList<T> {
  data: T
  fetchedAt: number
}
const LIST_TTL = 3 * 60 * 1000

const quinielaListCache: CachedList<QuinielaSorteoRef[] | null> = { data: null, fetchedAt: 0 }

export interface QuinielaSorteoRef {
  fecha: string // ISO YYYY-MM-DD
  sorteo: number
  turno: TurnoType // Previa | Primera | Matutina | Vespertina | Nocturna
}

async function fetchText(url: string, timeout = FETCH_TIMEOUT): Promise<string | null> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(timeout),
    })
    if (!resp.ok) {
      logger.warn("[lotba-oficial] HTTP error", { url, status: resp.status })
      return null
    }
    return await resp.text()
  } catch (e) {
    logger.warn("[lotba-oficial] fetch failed", { url, error: String(e) })
    return null
  }
}

/**
 * Extrae `window.RESULTADOS_DATA = [...]` tolerando variaciones de formato
 * (tab/espacios/prop variable sin "window.", comillas simples, `:` vs `=`).
 * Bracket-matcher real: sigue profundidad de corchetes y respeta strings/escapes,
 * así que da igual que dentro haya `]; /*` o anidados. Valida o null.
 */
function extractResultadosData(html: string): unknown[] | null {
  // 1) Encontrar el marcador de la variable con permisividad de variantes
  const marker = /(?:window\.)?RESULTADOS_DATA\s*[:=]\s*/g
  const m = marker.exec(html)
  if (!m) return null

  const start = m.index + m[0].length
  // 2) Localizar el `[` de apertura
  const openIdx = html.indexOf("[", start)
  // Si hay basura (p. ej. "false;") antes del array, esto falla -> null (fallback correcto)
  if (openIdx < 0 || openIdx - start > 50) return null

  // 3) Bracket-matcher respetando strings y \ escapes
  let depth = 0
  let inString = false
  let stringQuote: string | null = null
  let escaped = false
  for (let i = openIdx; i < html.length; i++) {
    const ch = html[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (inString) {
      if (ch === "\\") {
        escaped = true
        continue
      }
      if (ch === stringQuote) {
        inString = false
        stringQuote = null
      }
      continue
    }
    if (ch === '"' || ch === "'") {
      inString = true
      stringQuote = ch
      continue
    }
    if (ch === "[" || ch === "{") depth++
    else if (ch === "]" || ch === "}") {
      depth--
      if (depth === 0) {
        const raw = html.slice(openIdx, i + 1)
        try {
          const parsed = JSON.parse(raw) as unknown
          return Array.isArray(parsed) ? parsed : null
        } catch (e) {
          logger.warn("[lotba-oficial] RESULTADOS_DATA JSON.parse error", {
            error: String(e),
            sample: raw.slice(0, 400),
          })
          return null
        }
      }
    }
  }
  logger.warn("[lotba-oficial] RESULTADOS_DATA brackets unmatched", { start })
  return null
}

// ─── Quiniela: lista de sorteos ──────────────────────────────────────────────

const TURNO_FROM_LABEL: Record<string, TurnoType> = {
  PREVIA: "Previa",
  PRIMERA: "Primera",
  MATUTINA: "Matutina",
  VESPERTINA: "Vespertina",
  NOCTURNA: "Nocturna",
}

export async function fetchQuinielaSorteoList(force = false): Promise<QuinielaSorteoRef[] | null> {
  const now = Date.now()
  if (!force && quinielaListCache.data && now - quinielaListCache.fetchedAt < LIST_TTL) {
    return quinielaListCache.data
  }

  const html = await fetchText(`${QUINIELA_BASE}/index.php`)
  if (!html) return quinielaListCache.data

  // "25/09/2026 - 18:00 - Sorteo Nº 52955 - VESPERTINA"
  const regex = /(\d{2})\/(\d{2})\/(\d{4})\s+-\s+\d{2}:\d{2}\s+-\s+Sorteo\s+N[º°o]\s*(\d+)\s+-\s+([A-ZÁÉÍÓÚÑ]+)/g
  const refs: QuinielaSorteoRef[] = []
  let m: RegExpExecArray | null
  while ((m = regex.exec(html)) !== null) {
    const [, dd, mm, yyyy, sorteo, turnoLabel] = m
    const turno = TURNO_FROM_LABEL[turnoLabel.trim().toUpperCase()]
    if (!turno) continue
    refs.push({ fecha: `${yyyy}-${mm}-${dd}`, sorteo: parseInt(sorteo, 10), turno })
  }

  if (refs.length === 0) {
    logger.warn("[lotba-oficial] quiniela sorteo list empty (page format change?)")
    return quinielaListCache.data
  }

  quinielaListCache.data = refs
  quinielaListCache.fetchedAt = now
  return refs
}

// ─── Quiniela: números de un sorteo ─────────────────────────────────────────

export async function fetchQuinielaDrawNumbers(sorteo: number): Promise<number[] | null> {
  const html = await fetchText(`${QUINIELA_BASE}/includes/resultados-data.php?sorteo=${sorteo}`)
  if (!html) return null

  const data = extractResultadosData(html)
  if (!data || data.length === 0) {
    logger.warn("[lotba-oficial] resultados-data sin payload - OCR fallback", { sorteo })
    return await extraerNumerosConGemini(html, { kind: "quiniela", sorteo })
  }

  const entry = data[0] as {
    sorteo?: number
    fecha?: string
    jurisdicciones?: Record<string, { numeros?: { pos?: string; val?: string }[] }>
  }

  // jurisdicción 51 = Ciudad de Buenos Aires
  const numeros = entry?.jurisdicciones?.["51"]?.numeros
  if (!numeros || numeros.length < 20) {
    logger.warn("[lotba-oficial] sin jurisdiccion 51 o insuficiente - OCR fallback", {
      sorteo,
      jurisdicciones: entry?.jurisdicciones ? Object.keys(entry.jurisdicciones) : [],
      count: numeros?.length ?? 0,
    })
    return await extraerNumerosConGemini(html, { kind: "quiniela", sorteo })
  }

  const numbers = numeros
    .map((n) => parseInt(n.val ?? "", 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999)

  if (numbers.length < 20) {
    logger.warn("[lotba-oficial] números 4-digit detectados insuficientes - OCR fallback", { sorteo, count: numbers.length })
    return await extraerNumerosConGemini(html, { kind: "quiniela", sorteo })
  }
  return numbers.slice(0, 20)
}

/** Devuelve los 20 números del sorteo oficial para (fecha, turno). Null si aún no publicado. */
export async function fetchQuinielaDraw(fechaISO: string, turno: TurnoType): Promise<number[] | null> {
  const list = await fetchQuinielaSorteoList()
  if (!list) return null

  const ref = list.find((r) => r.fecha === fechaISO && r.turno === turno)
  if (!ref) {
    logger.info("[lotba-oficial] sorteo quiniela aún no publicado", { fechaISO, turno })
    return null
  }

  return await fetchQuinielaDrawNumbers(ref.sorteo)
}
