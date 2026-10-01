/**
 * LOTBA Official Scraper — única fuente autorizada de datos.
 *
 * Quiniela (nacional/CABA, 5 turnos):
 *   - Lista de sorteos: https://quiniela.loteriadelaciudad.gob.ar/index.php  (HTML)
 *     → "25/09/2026 - 18:00 - Sorteo Nº 52955 - VESPERTINA"
 *   - Números: https://quiniela.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=N
 *     → window.RESULTADOS_DATA = [{ sorteo, fecha, jurisdicciones: { "51": { numeros: [{val:"5791"}] } } }]
 *
 * Poceada (20 números 00-99, sorteo diario 21:00):
 *   - Lista de sorteos: https://poceada.loteriadelaciudad.gob.ar/  (HTML)
 *     → "25/09/2026 ... Sorteo Nº 9729"
 *   - Números: https://poceada.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=N
 *     → window.RESULTADOS_DATA = [{ sorteo, fecha, numeros_juegos: { Tradicional: ["00", ...] } }]
 *
 * Frío/hard-failure de un endpoint no rompe el pipeline: devuelve null y el
 * llamador decide (retry posterior / esperar próximo cron).
 */

import logger from "@/lib/logger"
import type { TurnoType } from "./types"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 12000

const QUINIELA_BASE = "https://quiniela.loteriadelaciudad.gob.ar"
const POCEADA_BASE = "https://poceada.loteriadelaciudad.gob.ar"

export const SOURCE_LOTBA = "lotba-oficial"

// Caché de listas de sorteos (TTL corto: el sorteo de turno recién publicado
// debe verse rápido, pero evita re-fetch por cada turno dentro del mismo cron)
interface CachedList<T> {
  data: T
  fetchedAt: number
}
const LIST_TTL = 3 * 60 * 1000

const quinielaListCache: CachedList<QuinielaSorteoRef[] | null> = { data: null, fetchedAt: 0 }
const poceadaListCache: CachedList<PoceadaSorteoRef[] | null> = { data: null, fetchedAt: 0 }

export interface QuinielaSorteoRef {
  fecha: string // ISO YYYY-MM-DD
  sorteo: number
  turno: TurnoType // Previa | Primera | Matutina | Vespertina | Nocturna
}

export interface PoceadaSorteoRef {
  fecha: string // ISO YYYY-MM-DD
  sorteo: number
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

/** Extrae `window.RESULTADOS_DATA = [...]` (JSON con prefijo JS). */
function extractResultadosData(html: string): unknown[] | null {
  const m = html.match(/window\.RESULTADOS_DATA\s*=\s*(\[[\s\S]*?\])\s*;/)
  if (!m) return null
  try {
    return JSON.parse(m[1]) as unknown[]
  } catch {
    return null
  }
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
    logger.warn("[lotba-oficial] resultados-data sin payload", { sorteo })
    return null
  }

  const entry = data[0] as {
    sorteo?: number
    fecha?: string
    jurisdicciones?: Record<string, { numeros?: { pos?: string; val?: string }[] }>
  }

  // jurisdicción 51 = Ciudad de Buenos Aires
  const numeros = entry?.jurisdicciones?.["51"]?.numeros
  if (!numeros || numeros.length < 20) {
    logger.warn("[lotba-oficial] sin jurisdiccion 51 o insuficiente", {
      sorteo,
      jurisdicciones: entry?.jurisdicciones ? Object.keys(entry.jurisdicciones) : [],
      count: numeros?.length ?? 0,
    })
    return null
  }

  const numbers = numeros
    .map((n) => parseInt(n.val ?? "", 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 9999)

  if (numbers.length < 20) return null
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

// ─── Poceada: lista de sorteos ───────────────────────────────────────────────

export async function fetchPoceadaSorteoList(force = false): Promise<PoceadaSorteoRef[] | null> {
  const now = Date.now()
  if (!force && poceadaListCache.data && now - poceadaListCache.fetchedAt < LIST_TTL) {
    return poceadaListCache.data
  }

  const html = await fetchText(`${POCEADA_BASE}/`)
  if (!html) return poceadaListCache.data

  // "25/09/2026 ... Sorteo Nº 9729" (fecha antes o después del rótulo)
  const refs: PoceadaSorteoRef[] = []
  const push = (dd: string, mm: string, yyyy: string, sorteo: string) => {
    refs.push({ fecha: `${yyyy}-${mm}-${dd}`, sorteo: parseInt(sorteo, 10) })
  }

  const fwd = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,300}?Sorteo\s+N[º°o]\s*(\d+)/g
  let m: RegExpExecArray | null
  while ((m = fwd.exec(html)) !== null) push(m[1], m[2], m[3], m[4])

  if (refs.length === 0) {
    const rev = /Sorteo\s+N[º°o]\s*(\d+)[\s\S]{0,300}?(\d{2})\/(\d{2})\/(\d{4})/g
    while ((m = rev.exec(html)) !== null) push(m[2], m[3], m[4], m[1])
  }

  if (refs.length === 0) {
    logger.warn("[lotba-oficial] poceada sorteo list empty (page format change?)")
    return poceadaListCache.data
  }

  // Dedupe por fecha (quedarse con el sorteo más alto si se repite)
  const byFecha = new Map<string, PoceadaSorteoRef>()
  for (const r of refs) {
    const prev = byFecha.get(r.fecha)
    if (!prev || r.sorteo > prev.sorteo) byFecha.set(r.fecha, r)
  }

  poceadaListCache.data = [...byFecha.values()]
  poceadaListCache.fetchedAt = now
  return poceadaListCache.data
}

// ─── Poceada: números de un sorteo ──────────────────────────────────────────

export async function fetchPoceadaDrawNumbers(sorteo: number): Promise<number[] | null> {
  const html = await fetchText(`${POCEADA_BASE}/includes/resultados-data.php?sorteo=${sorteo}`)
  if (!html) return null

  const data = extractResultadosData(html)
  if (!data || data.length === 0) {
    logger.warn("[lotba-oficial] poceada data sin payload", { sorteo })
    return null
  }

  const entry = data[0] as {
    sorteo?: number
    fecha?: string
    numeros_juegos?: { Tradicional?: string[] }
  }

  const raw = entry?.numeros_juegos?.Tradicional
  if (!raw || raw.length < 20) {
    logger.warn("[lotba-oficial] poceada sin numeros_juegos.Tradicional", { sorteo, count: raw?.length ?? 0 })
    return null
  }

  const numbers = raw
    .map((s) => parseInt(String(s).trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 99)

  if (numbers.length < 20) return null
  return numbers.slice(0, 20)
}

/** Devuelve los 20 números oficiales de Poceada para la fecha. Null si aún no publicado. */
export async function fetchPoceadaDrawOficial(fechaISO: string): Promise<number[] | null> {
  const list = await fetchPoceadaSorteoList()
  if (!list) return null

  const ref = list.find((r) => r.fecha === fechaISO)
  if (!ref) {
    logger.info("[lotba-oficial] sorteo poceada aún no publicado", { fechaISO })
    return null
  }

  return await fetchPoceadaDrawNumbers(ref.sorteo)
}
