/**
 * Parser for loteriasmundiales.com.ar
 *
 * The homepage (/Quinielas/ciudad) renders today's cabezas for ALL provinces
 * across 5 turnos in a <table class="w3-table-all">. Each province row has
 * 5 <td id="idL*"><b>NNNN</b></td> cells — one per turno.
 *
 * Columns map to turnos by position in the header row:
 *   0 = Previa (10:15)
 *   1 = Primera (11:30)
 *   2 = Matutina (14:00)
 *   3 = Vespertina (17:30)
 *   4 = Nocturna (21:00)
 *
 * This source provides ONLY the cabeza (first number) per turno per province.
 * It is useful for cross-validation, NOT for full 20-premios extraction.
 */

import type { ScrapeResult } from "./types"

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
]

const TURNO_INDEX: Record<string, number> = {
  Previa: 0,
  Primera: 1,
  Matutina: 2,
  Vespertina: 3,
  Nocturna: 4,
}

const BASE_URL = "https://loteriasmundiales.com.ar/Quinielas/ciudad"
const REQUEST_TIMEOUT_MS = 10_000
const MAX_RETRIES = 2
const RETRY_DELAY_MS = 2_000
const MIN_NUMBER = 0
const MAX_NUMBER = 9_999

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isValidNumber(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_NUMBER && n <= MAX_NUMBER
}

/**
 * Extract all 4-digit numbers from <b> tags inside td elements with id="idL*".
 * Returns a flat array of {CellIndex, number} pairs preserving DOM order.
 *
 * HTML pattern per cell:
 *   <td style="..." id="idL265"><b>\n5193\t\t\t\t\t\t\t\t\t</b></td>
 */
function extractCells(html: string): Array<{ cellIndex: number; number: number | null }> {
  const results: Array<{ cellIndex: number; number: number | null }> = []

  // Match each <td id="idLNNN">...</td> block
  const tdRx = /<td\s+[^>]*id="idL(\d+)"[^>]*>([\s\S]*?)<\/td>/gi
  let tdMatch: RegExpExecArray | null

  while ((tdMatch = tdRx.exec(html)) !== null) {
    const cellId = parseInt(tdMatch[1], 10)
    const cellContent = tdMatch[2]

    // Extract number from <b> tag inside the cell
    const bRx = /<b>\s*(\d{1,4})?\s*<\/b>/i
    const bMatch = bRx.exec(cellContent)

    if (bMatch && bMatch[1]) {
      const num = parseInt(bMatch[1], 10)
      results.push({
        cellIndex: cellId,
        number: isValidNumber(num) ? num : null,
      })
    } else {
      results.push({ cellIndex: cellId, number: null })
    }
  }

  return results
}

/**
 * Parse the HTML from loteriasmundiales.com.ar and extract the cabeza
 * (first number) for a specific province and turno.
 *
 * @param html       - Raw HTML from the page
 * @param provinceId - The province slug to match (e.g. "ciudad")
 * @param turno      - Target turno name (Previa|Primera|Matutina|Vespertina|Nocturna)
 * @returns The cabeza number, or null if not found
 */
function parseCabezaFromHtml(html: string, provinceId: string, turno: string): number | null {
  const turnoIdx = TURNO_INDEX[turno]
  if (turnoIdx === undefined) return null

  // Find the row for the target province: <form action="/Quinielas/{provinceId}"
  const provinceFormRx = new RegExp(
    `<form\\s+action="/Quinielas/${provinceId}"[\\s\\S]*?</tr>`,
    "i"
  )
  const rowMatch = provinceFormRx.exec(html)
  if (!rowMatch) return null

  const rowHtml = rowMatch[0]

  // Extract all <td id="idL*"><b>NNNN</b></td> cells from this row
  const cells: Array<{ position: number; number: number | null }> = []
  const cellRx = /<td\s+[^>]*id="idL(\d+)"[^>]*>\s*<b>\s*(\d{1,4})?\s*<\/b>\s*<\/td>/gi
  let cellMatch: RegExpExecArray | null

  while ((cellMatch = cellRx.exec(rowHtml)) !== null) {
    const numStr = cellMatch[2]
    const num = numStr ? parseInt(numStr, 10) : NaN
    cells.push({
      position: cells.length,
      number: isValidNumber(num) ? num : null,
    })
  }

  // The turno determines which column position to read
  if (cells.length <= turnoIdx) return null
  return cells[turnoIdx].number
}

/**
 * Fetch today's cabeza from loteriasmundiales.com.ar for the given turno.
 *
 * @param fechaISO - Date in YYYY-MM-DD format (only works for today)
 * @param turno    - Turno name
 * @returns ScrapeResult with a single number (the cabeza), or null
 */
export async function parseLoteriasMundialesCabeza(
  fechaISO: string,
  _fechaUrl: string,
  turno: string
): Promise<ScrapeResult | null> {
  // Only works for today's date
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format()

  if (fechaISO !== hoy) return null

  const turnoIdx = TURNO_INDEX[turno]
  if (turnoIdx === undefined) return null

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt)

    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

      const res = await fetch(BASE_URL, {
        headers: {
          "User-Agent": randomUA(),
          Accept: "text/html",
          "Accept-Language": "es-AR,es;q=0.9",
        },
        signal: controller.signal,
      })

      clearTimeout(timer)

      if (!res.ok) return null

      const html = await res.text()

      // Quick sanity: page must contain the turno time markers
      if (!html.includes("QUINIELA")) return null

      const cabeza = parseCabezaFromHtml(html, "ciudad", turno)
      if (cabeza === null) return null

      return {
        numbers: [cabeza],
        source: "loteriasmundiales.com.ar",
        cabezaMatch: null,
      }
    } catch (err) {
      if (attempt === MAX_RETRIES) return null
    }
  }

  return null
}

/**
 * Cross-validate a cabeza number against loteriasmundiales.com.ar.
 * Returns true if the provided number matches, false if mismatch, null on error.
 */
export async function verifyCabezaViaLoteriasMundiales(
  fechaISO: string,
  turno: string,
  expectedCabeza: number
): Promise<boolean | null> {
  const result = await parseLoteriasMundialesCabeza(fechaISO, "", turno)
  if (!result || result.numbers.length === 0) return null
  return result.numbers[0] === expectedCabeza
}
