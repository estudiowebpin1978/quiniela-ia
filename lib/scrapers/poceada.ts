/**
 * Poceada LOTBA Official Scraper
 *
 * Poceada draws 20 numbers (00-99) daily at 21:00 ART, Mon-Sat.
 * Player picks 8 numbers. Wins with 5/6/7/8 matches against the 20 drawn.
 *
 * Única fuente autorizada: poceada.loteriadelaciudad.gob.ar
 *   - Home (HTML) → mapeo fecha → Sorteo Nº
 *   - includes/resultados-data.php?sorteo=N → numeros_juegos.Tradicional (20 nums)
 * Ver lib/scrapers/lotba-oficial.ts para el detalle.
 */

import logger from "@/lib/logger"
import { fetchPoceadaDrawOficial, fetchPoceadaSorteoList, SOURCE_LOTBA } from "./lotba-oficial"

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

export interface PoceadaDraw {
  date: string
  numbers: number[]       // 20 drawn numbers
  sorteoNumber: number | null
  source: string
}

// ─── Official entry point ────────────────────────────────────────────────────

/**
 * Fetch Poceada draw from the official LOTBA site (única fuente autorizada).
 * Returns null when the sorteo is not yet published — caller retries on the
 * next cron tick (verification runs every 5 minutes).
 */
export async function fetchPoceadaDraw(fechaISO: string): Promise<PoceadaDraw | null> {
  const numbers = await fetchPoceadaDrawOficial(fechaISO)
  if (!numbers || numbers.length < 20) {
    logger.warn("[poceada-scraper] official source unavailable", { fecha: fechaISO })
    return null
  }

  const list = await fetchPoceadaSorteoList()
  const ref = list?.find((r) => r.fecha === fechaISO) ?? null

  logger.info("[poceada-scraper] official draw loaded", {
    fecha: fechaISO,
    sorteo: ref?.sorteo ?? null,
    source: SOURCE_LOTBA,
  })

  return {
    date: fechaISO,
    numbers: numbers.slice(0, 20),
    sorteoNumber: ref?.sorteo ?? null,
    source: SOURCE_LOTBA,
  }
}

// ─── Historical fetcher ────────────────────────────────────────────────────

/**
 * Fetch all available historical Poceada draws from ruta1000.
 * This is the most reliable source for historical data.
 */
export async function fetchPoceadaHistorical(): Promise<PoceadaDraw[]> {
  const draws: PoceadaDraw[] = []

  try {
    const resp = await fetch("http://quinielapoceada.ruta1000.com.ar/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) return draws

    const buffer = await resp.arrayBuffer()
    const decoder = new TextDecoder("windows-1252")
    const html = decoder.decode(buffer)

    // Parse all sorteo sections from ruta1000
    const monthMap: Record<string, string> = {
      enero: "01", febrero: "02", marzo: "03", abril: "04",
      mayo: "05", junio: "06", julio: "07", agosto: "08",
      septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
    }

    // Find all sorteo sections
    const sorteoRegex = /Sorteo\s+N[°º]\s*(\d+)[\s\S]*?(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi

    let match: RegExpExecArray | null
    while ((match = sorteoRegex.exec(html)) !== null) {
      const sorteoNum = parseInt(match[1])
      const day = match[2].padStart(2, "0")
      const month = monthMap[match[3].toLowerCase()] || "01"
      const year = match[4]
      const fechaISO = `${year}-${month}-${day}`

      // Skip if we already have this date
      if (draws.some(d => d.date === fechaISO)) continue

      // Extract 20 numbers from the section after this sorteo header
      const sectionStart = match.index
      const sectionEnd = html.indexOf("<hr>", sectionStart)
      const section = html.substring(sectionStart, sectionEnd > 0 ? sectionEnd : sectionStart + 5000)

      // Find <b>XX</b> patterns
      const numbers: number[] = []
      const boldNumRegex = /<b>(\d{2})<\/b>/gi
      let numMatch: RegExpExecArray | null
      while ((numMatch = boldNumRegex.exec(section)) !== null) {
        const num = parseInt(numMatch[1], 10)
        if (num >= 0 && num <= 99 && !numbers.includes(num)) {
          numbers.push(num)
        }
        if (numbers.length >= 20) break
      }

      if (numbers.length >= 20) {
        draws.push({
          date: fechaISO,
          numbers: numbers.slice(0, 20),
          sorteoNumber: sorteoNum,
          source: "ruta1000-historical",
        })
      }
    }
  } catch (e) {
    logger.warn("[poceada-scraper] Historical fetch failed", { error: String(e) })
  }

  return draws
}

/**
 * Fetch historical draws from La Nacion.
 */
export async function fetchPoceadaHistoricalLaNacion(): Promise<PoceadaDraw[]> {
  const draws: PoceadaDraw[] = []

  try {
    const resp = await fetch("https://www.lanacion.com.ar/loterias/quiniela-poceada/", {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(10000),
    })
    if (!resp.ok) return draws

    const html = await resp.text()

    // Find all 40-digit blocks (20 two-digit numbers)
    const allBlocks = html.match(/\b(\d{40})\b/g)
    if (!allBlocks) return draws

    // La Nacion shows results in reverse chronological order
    // Each block corresponds to a draw date
    const dateRegex = /(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi
    const monthMap: Record<string, string> = {
      enero: "01", febrero: "02", marzo: "03", abril: "04",
      mayo: "05", junio: "06", julio: "07", agosto: "08",
      septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
    }

    const dates: string[] = []
    let match: RegExpExecArray | null
    while ((match = dateRegex.exec(html)) !== null) {
      const day = match[1].padStart(2, "0")
      const month = monthMap[match[2].toLowerCase()] || "01"
      const year = match[3]
      dates.push(`${year}-${month}-${day}`)
    }

    // Match blocks to dates
    for (let i = 0; i < Math.min(allBlocks.length, dates.length); i++) {
      const block = allBlocks[i]
      const fechaISO = dates[i]

      if (draws.some(d => d.date === fechaISO)) continue

      const numbers: number[] = []
      for (let j = 0; j < 40; j += 2) {
        const num = parseInt(block.substring(j, j + 2), 10)
        if (num >= 0 && num <= 99) numbers.push(num)
      }

      if (numbers.length >= 20) {
        draws.push({
          date: fechaISO,
          numbers: numbers.slice(0, 20),
          sorteoNumber: null,
          source: "lanacion-historical",
        })
      }
    }
  } catch (e) {
    logger.warn("[poceada-lanacion] Historical fetch failed", { error: String(e) })
  }

  return draws
}
