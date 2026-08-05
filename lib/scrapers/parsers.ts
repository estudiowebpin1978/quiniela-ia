/**
 * Quiniela parsers for 5 scraping sources.
 * Each parser returns ScrapeResult with 20-number array or null on failure.
 *
 * Sources:
 *   1. loteriadelaciudad.gob.ar  — Official API (POST, HTML response)
 *   2. quinielanacional1.com.ar   — Primary HTML scraper
 *   3. quinieleando.com.ar        — Fallback HTML scraper
 *   4. ruta1000.com.ar            — Fallback HTML scraper (simple table)
 *   5. quiniela22.com             — Cross-validation (cabeza only)
 */

import { ScrapeResult, TurnoType, GAME_ID } from "./types"
import { esFeriado } from "@/lib/feriados"
import logger from "@/lib/logger"

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
]

let uaIndex = 0
function rotationUA(): string {
  const ua = USER_AGENTS[uaIndex % USER_AGENTS.length]
  uaIndex++
  return ua
}

function extractNums(html: string, rx: RegExp, max = 20): number[] {
  const nums: number[] = []
  let mx: RegExpExecArray | null
  while ((mx = rx.exec(html)) !== null) {
    const n = parseInt(mx[1])
    if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
    if (nums.length >= max) break
  }
  return nums
}

let sorteoCodeCache: { code: number; fecha: string; expiresAt: number } | null = null

async function discoverLatestSorteoCode(): Promise<number | null> {
  if (sorteoCodeCache && Date.now() < sorteoCodeCache.expiresAt) {
    return sorteoCodeCache.code
  }
  sorteoCodeCache = null
  return null
}

async function computeSorteoCodeFromDate(fechaISO: string, turno: TurnoType): Promise<number> {
  const refDateStr = process.env.LOTERIA_REF_DATE || "2024-01-01"
  const refDate = new Date(refDateStr + "T12:00:00Z")
  const targetDate = new Date(fechaISO + "T12:00:00Z")
  const daysDiff = Math.round((targetDate.getTime() - refDate.getTime()) / 86400000)
  let weekdays = 0
  for (let i = 1; i <= daysDiff; i++) {
    const d = new Date(refDate.getTime() + i * 86400000)
    if (d.getDay() === 0) continue
    const ds = d.toISOString().slice(0, 10)
    if (esFeriado(ds)) continue
    weekdays++
  }
  const turnoIdx: number = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"].indexOf(turno)
  return 52492 + weekdays * 5 + turnoIdx
}

export async function getSorteoCode(fechaISO: string, turno: TurnoType): Promise<number> {
  return computeSorteoCodeFromDate(fechaISO, turno)
}

// ─── Source 1: Lotería de la Ciudad (Official) ───────────────────────────────
// POST to PHP endpoint, HTML response with <div class="pos">NN</div> + <div>NNNN</div>
export async function parseLoteriaOficial(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  const sorteoCode = await getSorteoCode(fechaISO, turno)

  try {
    const r = await fetch(
      "https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": rotationUA(),
          Referer: "https://www.loteriadelaciudad.gob.ar/",
        },
        body: `codigo=0080&juridiccion=51&sorteo=${sorteoCode}`,
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!r.ok) return null
    const html = await r.text()
    if (
      html.includes("No hay Sorteo") ||
      html.includes("Sorteo no realizado") ||
      html.includes("sin resultado")
    )
      return null

    const patterns = [
      /<div\s+class\s*=\s*["'][^"']*pos[^"']*["']\s*>\s*\d{2}\s*<\/div>\s*<div[^>]*>\s*(\d{4})\s*<\/div>/gi,
      /<div[^>]*class\s*=\s*["'][^"']*pos[^"']*["'][^>]*>\s*(\d{4})\s*<\/div>/gi,
    ]
    let nums: number[] = []
    for (const rx of patterns) {
      nums = extractNums(html, rx)
      if (nums.length >= 5) break
    }
    if (nums.length < 5) return null
    return {
      numbers: nums,
      source: "loteria-ciudad.gob.ar",
      cabezaMatch: null,
      duration: Date.now() - start,
      retries: 0,
    }
  } catch (e) {
    logger.debug("[scraper] parseLoteriaOficial failed", { error: String(e) })
    return null
  }
}

// ─── Source 2: QuinielaNacional1 (Primary fast) ──────────────────────────────
// HTML with <div class="veintena"> and <div class="numero">NNNN</div>
export async function parseQuinielaNacional1(
  _fechaISO: string,
  fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  const url = `https://quinielanacional1.com.ar/${fechaUrl}/${turno}`

  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise((r) => setTimeout(r, 3000))
    try {
      const html = await (
        await fetch(url, {
          headers: { "User-Agent": rotationUA(), Accept: "text/html" },
          signal: AbortSignal.timeout(8000),
        })
      ).text()

      if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado"))
        return null

      let veintenaIdx = html.indexOf('class="veintena"')
      if (veintenaIdx < 0) veintenaIdx = html.indexOf("class='veintena'")
      if (veintenaIdx < 0) veintenaIdx = html.search(/class\s*=\s*["']veintena["']/)
      if (veintenaIdx < 0) continue

      const chunk = html.slice(veintenaIdx, veintenaIdx + 5000)
      const rx =
        /class\s*=\s*["']?numero["']?\s*>\s*(?:<(?:b|strong|span)[^>]*>)?\s*(\d{1,4})\s*(?:<\/(?:b|strong|span)>)?\s*<\/div>/gi
      const nums = extractNums(chunk, rx)
      if (nums.length >= 5) {
        return {
          numbers: nums,
          source: "quinielanacional1.com.ar",
          cabezaMatch: null,
          duration: Date.now() - start,
          retries: intento,
        }
      }
    } catch (e) {
      logger.debug("[scraper] parseQuinielaNacional1 attempt failed", {
        intento,
        error: String(e),
      })
    }
  }
  return null
}

// ─── Source 3: Quinieleando (Fallback 1) ─────────────────────────────────────
// HTML with <span class="nro"><b>NNNN</b></span> (cabeza) and <span class="nro">NNNN</span>
export async function parseQuinieleando(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const hoy = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format()
    if (fechaISO !== hoy) return null

    const url = `https://quinieleando.com.ar/quinielas/nacional/resultados-de-hoy`
    const html = await (
      await fetch(url, {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
      })
    ).text()

    if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado"))
      return null

    const turnoUpper = turno.toUpperCase()
    const turnoHeaderRx = new RegExp(
      `<h3>\\s*${turnoUpper}\\s*[,:;\\-]?\\s*Quiniela\\s*Nacional[^<]*<\\/h3>`,
      "gi"
    )
    const headerMx = turnoHeaderRx.exec(html)
    if (!headerMx) return null

    const afterHeader = html.slice(headerMx.index, headerMx.index + 6000)
    const tableEnd = afterHeader.indexOf("</table>")
    const chunk = tableEnd > 0 ? afterHeader.slice(0, tableEnd) : afterHeader.slice(0, 4000)

    const rx =
      /class\s*=\s*["']nro["']\s*>\s*(?:<(?:b|strong|span)[^>]*>)?\s*(\d{1,4})\s*(?:<\/(?:b|strong|span)>)?\s*<\/span>/gi
    const nums = extractNums(chunk, rx)
    if (nums.length >= 5) {
      return {
        numbers: nums,
        source: "quinieleando.com.ar",
        cabezaMatch: null,
        duration: Date.now() - start,
        retries: 0,
      }
    }
  } catch (e) {
    logger.debug("[scraper] parseQuinieleando failed", { error: String(e) })
  }
  return null
}

// ─── Source 4: Ruta1000 (Fallback HTML) ───────────────────────────────────────
// HTML with <td> cells containing 4-digit numbers, turno sections
export async function parseRuta1000(
  _fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const html = await (
      await fetch("https://quinieladelaciudad.ruta1000.com.ar/", {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
      })
    ).text()

    const turnoMap: Record<TurnoType, string> = {
      Previa: "LA PREVIA",
      Primera: "LA PRIMERA",
      Matutina: "LA MATUTINA",
      Vespertina: "LA VESPERTINA",
      Nocturna: "LA NOCTURNA",
    }

    const turnoHeader = turnoMap[turno]
    const headerIdx = html.indexOf(turnoHeader)
    if (headerIdx < 0) return null

    // Find the next turno header to delimit the section
    const nextHeaders = Object.values(turnoMap)
      .map((h) => html.indexOf(h, headerIdx + turnoHeader.length))
      .filter((i) => i > headerIdx)
    const endIdx = nextHeaders.length > 0 ? Math.min(...nextHeaders) : headerIdx + 3000

    const section = html.substring(headerIdx, endIdx)

    // Extract 4-digit numbers from <td> cells
    const tdRx = /<td[^>]*>\s*(\d{4})\s*<\/td>/gi
    const nums = extractNums(section, tdRx)

    if (nums.length >= 5) {
      return {
        numbers: nums,
        source: "ruta1000.com.ar",
        cabezaMatch: null,
        duration: Date.now() - start,
        retries: 0,
      }
    }
  } catch (e) {
    logger.debug("[scraper] parseRuta1000 failed", { error: String(e) })
  }
  return null
}

// ─── Source 5: Quiniela22 (Cabeza cross-validation only) ─────────────────────
// Returns only the cabeza (first number) for cross-validation
export async function parseQuiniela22Cabeza(
  _fechaISO: string,
  fechaUrl: string,
  turno: TurnoType
): Promise<number | null> {
  try {
    const [dd, mm, yy] = fechaUrl.split("-")
    const dayNames = [
      "Domingo",
      "Lunes",
      "Martes",
      "Miercoles",
      "Jueves",
      "Viernes",
      "Sabado",
    ]
    const d = new Date(`20${yy}-${mm}-${dd}T12:00:00Z`)
    const dayName = dayNames[d.getUTCDay()]
    const url = `https://quiniela22.com/${turno}/Ciudad/${dayName}_${fechaUrl}`
    const html = await (
      await fetch(url, {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(8000),
      })
    ).text()
    const rx =
      /class\s*=\s*["']num["']\s*>\s*<a[^>]*>\s*(\d{3,4})\s*<\/a>\s*<\/div>/gi
    const mx = rx.exec(html)
    if (mx) return parseInt(mx[1])
  } catch (e) {
    logger.debug("[scraper] parseQuiniela22Cabeza failed", { error: String(e) })
  }
  return null
}

// ─── Cross-validation helper ──────────────────────────────────────────────────
export async function verifyCabeza(
  fechaUrl: string,
  turno: TurnoType,
  expectedNum: number
): Promise<boolean | null> {
  const cabeza = await parseQuiniela22Cabeza("", fechaUrl, turno)
  if (cabeza === null) return null
  return cabeza === expectedNum
}
