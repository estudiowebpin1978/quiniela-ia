/**
 * Scraper alternativo Poceada Federal usando tujugada.com.ar
 *
 * Fuente respaldo: https://www.tujugada.com.ar/poceada-federal.asp
 * Muestra sorteo actual + sorteos anteriores (paginación por sorteo Nº)
 * Formato de URL: poceada-federal.asp?sorteo=5765
 */
import logger from "@/lib/logger"

const BASE_URL = "https://www.tujugada.com.ar/poceada-federal.asp"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export interface TuJugadaDraw {
  sorteo: number
  date: string // YYYY-MM-DD
  numbers: number[] // 20 numbers 0-99
  source: string
}

export async function fetchTuJugadaPoceadaFederal(sorteo?: number): Promise<TuJugadaDraw | null> {
  const url = sorteo ? `${BASE_URL}?sorteo=${sorteo}` : BASE_URL

  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    })
    if (!resp.ok) {
      logger.warn("[tujugada-poceada-federal] HTTP error", { url, status: resp.status })
      return null
    }
    const html = await resp.text()

    // --- Extraer sorteo y fecha ---
    const sorteoMatch = html.match(/Sorteo[:\s]*N[°ºo]\s*(\d+)/i)
    const dateMatch = html.match(/Sorteo\s+N[°ºo]\s*\d+\s*[-–]\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i) ||
      html.match(/del[:\s]*(\d{1,2})\/(\d{1,2})\/(\d{4})/i)

    if (!sorteoMatch || !dateMatch) {
      logger.warn("[tujugada-poceada-federal] no sorteo/date found", { url })
      return null
    }

    const sorteoNum = parseInt(sorteoMatch[1], 10)
    const day = parseInt(dateMatch[1], 10).toString().padStart(2, "0")
    const month = parseInt(dateMatch[2], 10).toString().padStart(2, "0")
    const year = dateMatch[3]
    const dateISO = `${year}-${month}-${day}`

    // --- Extraer 20 números ---
    // Los números aparecen en la tabla, separados por |
    // Patrón: número de 1-2 dígitos entre pipes
    const numbers: number[] = []
    const tableMatch = html.match(/POCEADA FEDERAL[\s\S]*?\|([\s\d\|]+)\|/)
    if (tableMatch) {
      const cells = tableMatch[1].split("|")
      for (const cell of cells) {
        const trimmed = cell.trim()
        if (/^\d{1,2}$/.test(trimmed)) {
          const num = parseInt(trimmed, 10)
          if (num >= 0 && num <= 99 && !numbers.includes(num)) {
            numbers.push(num)
          }
        }
        if (numbers.length >= 20) break
      }
    }

    // Fallback: buscar todos los números entre pipes en la primera tabla
    if (numbers.length < 20) {
      const allNumMatches = html.match(/\| (\d{1,2}) \|/g)
      if (allNumMatches) {
        for (const m of allNumMatches) {
          const num = parseInt(m.replace(/\|/g, "").trim(), 10)
          if (num >= 0 && num <= 99 && !numbers.includes(num)) {
            numbers.push(num)
          }
          if (numbers.length >= 20) break
        }
      }
    }

    if (numbers.length < 20) {
      logger.warn("[tujugada-poceada-federal] insufficient numbers", { count: numbers.length, url })
      return null
    }

    return {
      sorteo: sorteoNum,
      date: dateISO,
      numbers: numbers.slice(0, 20),
      source: "tujugada.com.ar",
    }
  } catch (e) {
    logger.warn("[tujugada-poceada-federal] fetch failed", { error: String(e), url })
    return null
  }
}

/**
 * Obtener el sorteo más reciente disponible (sin parámetro de sorteo → home)
 */
export async function fetchLatestTuJugadaPoceadaFederal(): Promise<TuJugadaDraw | null> {
  return fetchTuJugadaPoceadaFederal()
}
