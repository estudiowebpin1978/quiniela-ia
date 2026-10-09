/**
 * Scraper del Brinco — fuente Caja de Acción Social (CAS).
 *
 * CAS publica resultados en HTML server-rendered, navegable por fecha:
 *   https://cas.gob.ar/juegos/sorteos/resultados?juego=brinco&fecha=YYYY-MM-DD
 *
 * Estructura relevante por sorteo (Tradicional y Junior en tarjetas separadas):
 *   <h4 ...>Tradicional</h4> <span class="quiniela-sorteo-id">Sorteo N° 1373</span>
 *   <div class="quini6-balls"> <div class="quini6-ball">05</div> ... (6) </div>
 *   <h4 ...>Junior</h4>      ... mismo patrón con otras 6 bolillas
 *
 * Cuando no hay resultado publicado, la página muestra
 *   "No hay resultados de Brinco publicados para el <fecha>"
 *
 * Nota de honestidad: el archivo accesible de CAS alcanza ~Mayo-Sept 2026.
 * No es el historial completo desde el año 2000 (el N° de concurso indica que
 * existen ~1373 concursos, pero no están expuestos por HTTP simple). El
 * scraper solo recupera lo que la fuente publica.
 *
 * Frío/hard-failure no rompe el pipeline: devuelve status "error" y el llamador
 * decide (reintento / esperar próximo cron). Nunca reemplaza datos con vacío.
 */

import logger from "@/lib/logger"
import {
  contarAciertos,
  esNumeroBrinco,
  formatoCombinacion,
  validarCombinacion,
} from "@/lib/brinco/reglas"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 12000

export const BRINCO_CAS_BASE = "https://cas.gob.ar"
export const SOURCE_CAS = "cas-oficial"

export interface BrincoSorteoScrapeado {
  concurso: number
  fecha: string // ISO YYYY-MM-DD
  tradicional: number[]
  junior: number[] | null
  fuente: string
  url: string
  extraido_en: string
}

export type ResultadoScraper =
  | { status: "ok"; sorteo: BrincoSorteoScrapeado }
  | { status: "sin_resultado"; fecha: string }
  | { status: "error"; fecha: string; detalle: string }

export function urlBrincoFecha(fechaISO: string): string {
  return `${BRINCO_CAS_BASE}/juegos/sorteos/resultados?juego=brinco&fecha=${fechaISO}`
}

const BALL_RE = /quini6-ball[^>]*>\s*(\d{1,2})\s*<\/div>/gi

/** Extrae las primeras `count` bolillas válidas de un segmento HTML. */
function extraerBolillas(segmento: string): number[] {
  const nums: number[] = []
  BALL_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = BALL_RE.exec(segmento)) !== null) {
    const v = Number.parseInt(m[1], 10)
    if (esNumeroBrinco(v)) nums.push(v)
    if (nums.length >= 6) break
  }
  return nums
}

/**
 * Parsea el HTML de resultados de CAS para una fecha. FUNCIÓN PURA (testeable
 * con fixtures). No hace red.
 */
export function parseBrincoCas(html: string, fechaISO: string, url: string): ResultadoScraper {
  if (!html || /no hay resultados/i.test(html)) {
    return { status: "sin_resultado", fecha: fechaISO }
  }

  const mConcurso = html.match(/Sorteo N[°º]\s*(\d+)/i)
  if (!mConcurso) {
    return { status: "error", fecha: fechaISO, detalle: "No se encontró el número de concurso" }
  }
  const concurso = Number.parseInt(mConcurso[1], 10)
  if (!Number.isFinite(concurso) || concurso <= 0) {
    return { status: "error", fecha: fechaISO, detalle: "Número de concurso inválido" }
  }

  const idxTrad = html.search(/Tradicional/i)
  const idxJunior = html.search(/Junior/i)
  if (idxTrad === -1) {
    return { status: "error", fecha: fechaISO, detalle: "No se encontró la sección Tradicional" }
  }

  const finTrad = idxJunior !== -1 && idxJunior > idxTrad ? idxJunior : idxTrad + 3000
  const tradicional = extraerBolillas(html.slice(idxTrad, finTrad))
  const vTrad = validarCombinacion(tradicional)
  if (!vTrad.ok) {
    return { status: "error", fecha: fechaISO, detalle: `Tradicional inválido: ${vTrad.errores.join("; ")}` }
  }

  let junior: number[] | null = null
  if (idxJunior !== -1) {
    const candidatos = extraerBolillas(html.slice(idxJunior, idxJunior + 3000))
    if (candidatos.length === 6) {
      const vJr = validarCombinacion(candidatos)
      if (vJr.ok) junior = candidatos
      else {
        // Junior presente pero inválido: no lo guardamos, pero no invalidamos el Tradicional.
        logger.warn("[brinco-scraper] Junior inválido descartado", { concurso, errores: vJr.errores })
      }
    }
  }

  return {
    status: "ok",
    sorteo: {
      concurso,
      fecha: fechaISO,
      tradicional,
      junior,
      fuente: SOURCE_CAS,
      url,
      extraido_en: new Date().toISOString(),
    },
  }
}

/**
 * Descarga y parsea el resultado de una fecha desde CAS.
 * Devuelve "error" (nunca datos vacíos) si la fuente no responde.
 */
export async function fetchBrincoCas(fechaISO: string): Promise<ResultadoScraper> {
  const url = urlBrincoFecha(fechaISO)
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      cache: "no-store",
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    })
    if (!resp.ok) {
      logger.warn("[brinco-scraper] HTTP error", { url, status: resp.status })
      return { status: "error", fecha: fechaISO, detalle: `HTTP ${resp.status}` }
    }
    const html = await resp.text()
    return parseBrincoCas(html, fechaISO, url)
  } catch (e) {
    logger.warn("[brinco-scraper] fetch failed", { url, error: String(e) })
    return { status: "error", fecha: fechaISO, detalle: String(e) }
  }
}

/**
 * Utilidad para cross-check: dado un sorteo y una jugada, cuenta aciertos.
 * Reexportada para que el backtest use la misma semántica de conjunto.
 */
export function aciertos(jugada: number[], sorteo: number[]): number {
  return contarAciertos(jugada, sorteo)
}

/** Helper de logging/inspección: combinación ordenada formateada. */
export function ver(numeros: number[]): string {
  return formatoCombinacion(numeros).join(" ")
}
