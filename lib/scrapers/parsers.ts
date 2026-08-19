/**
 * Quiniela parsers — Multi-source with fallback cascade.
 * Each parser returns ScrapeResult with 20-number array or null on failure.
 * ALL parsers validate that the scraped date matches the target date.
 *
 * Sources (priority order):
 *   1. quinieleando.com.ar       — Static HTML, all turnos (PRIMARY)
 *   2. loteria-ciudad.gob.ar     — Official CABA AJAX endpoint
 *   3. quinielanacionaln.com.ar  — HTTP homepage parser (all turnos, FALLBACK)
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

// ─── Source 1: Quinieleando (PRIMARY — static HTML) ──────────────────────────
// HTML structure: <table> with <small>pos</small> + <td>number</td> pairs
// URL: /quinielas/nacional/resultados-de-hoy (today) or /quinielas/ayer (yesterday)
export async function parseQuinieleando(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()

  // Determine if we're fetching today or yesterday
  const hoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format()
  const isToday = fechaISO === hoy

  const urls = isToday
    ? [
        `https://www.quinieleando.com.ar/quinielas/nacional/resultados-de-hoy`,
        `https://www.quinieleando.com.ar/quinielas/nacional/resultados-de-ayer`,
      ]
    : [`https://www.quinieleando.com.ar/quinielas/ayer`]

  for (const url of urls) {
    try {
      const html = await (
        await fetch(url, {
          headers: { "User-Agent": rotationUA(), Accept: "text/html" },
          signal: AbortSignal.timeout(10000),
        })
      ).text()

      if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado"))
        continue

      // Find turno section: <h2 class="alert alert-info">TURNOS</h2> or similar
      // Then find the table for "NACIONAL" within that turno
      const turnoUpper = turno.toUpperCase()

      // Pattern 1: turno header like "PREVIAS", "PRIMERA", "MATUTINA", "VESPERTINA", "NOCTURNAS"
      const turnoHeaders: Record<TurnoType, string[]> = {
        Previa: ["PREVIA", "PREVIAS"],
        Primera: ["PRIMERA", "PRIMERAS", "EL PRIMERO"],
        Matutina: ["MATUTINA", "MATUTINAS"],
        Vespertina: ["VESPERTINA", "VESPERTINAS"],
        Nocturna: ["NOCTURNA", "NOCTURNAS"],
      }

      const headers = turnoHeaders[turno]
      let headerIdx = -1
      let headerLen = 0
      for (const h of headers) {
        const idx = html.toUpperCase().indexOf(h)
        if (idx >= 0) {
          headerIdx = idx
          headerLen = h.length
          break
        }
      }
      if (headerIdx < 0) continue

      // Find NACIONAL table after the turno header
      const afterHeader = html.substring(headerIdx)
      const nacionalIdx = afterHeader.toUpperCase().indexOf("NACIONAL")
      if (nacionalIdx < 0) continue

      const afterNacional = afterHeader.substring(nacionalIdx)
      const tableStart = afterNacional.indexOf("<table")
      if (tableStart < 0) continue
      const tableEnd = afterNacional.indexOf("</table>", tableStart)
      const tableChunk = afterNacional.substring(tableStart, tableEnd > 0 ? tableEnd : tableStart + 5000)

      // Extract position+number pairs: <small>1</small></td><td class="lead"><b>6618</b></td>
      // or: <small>1</small></td><td>3842</td>
      const pairRx = /<small>(\d{1,2})<\/small><\/td>\s*<td[^>]*>(?:<[^>]*>)?(\d{4})(?:<\/[^>]*>)?<\/td>/gi
      const pairs: { pos: number; num: number }[] = []
      let pmx: RegExpExecArray | null
      while ((pmx = pairRx.exec(tableChunk)) !== null) {
        const pos = parseInt(pmx[1])
        const num = parseInt(pmx[2])
        if (pos >= 1 && pos <= 20 && num >= 0 && num <= 9999) {
          pairs.push({ pos, num })
        }
      }

      if (pairs.length >= 5) {
        pairs.sort((a, b) => a.pos - b.pos)
        const seen = new Set<number>()
        const nums: number[] = []
        for (const p of pairs) {
          if (!seen.has(p.pos)) {
            seen.add(p.pos)
            nums.push(p.num)
          }
        }
        if (nums.length >= 5) {
          return {
            numbers: nums,
            source: "quinieleando.com.ar",
            cabezaMatch: null,
            duration: Date.now() - start,
            retries: 0,
          }
        }
      }

      // Fallback: extract any 4-digit numbers in order from the NACIONAL table
      const numRx = /<td[^>]*>(?:<[^>]*>)?(\d{4})(?:<\/[^>]*>)?<\/td>/gi
      const nums2 = extractNums(tableChunk, numRx)
      if (nums2.length >= 5) {
        return {
          numbers: nums2,
          source: "quinieleando.com.ar",
          cabezaMatch: null,
          duration: Date.now() - start,
          retries: 0,
        }
      }
    } catch (e) {
      logger.debug("[scraper] parseQuinieleando attempt failed", { url, error: String(e) })
    }
  }
  return null
}

// ─── Source 2: Lotería de la Ciudad (Official CABA — AJAX) ───────────────────
// POST to PHP endpoint, HTML response with <div class="pos">NN</div> + <div>NNNN</div>
// Sorteo codes are discovered from the homepage dropdown (sequential, 5 per day Mon-Sat)
export async function parseLoteriaOficial(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()

  try {
    // Step 1: Fetch homepage to discover sorteo codes for the target date
    const homeR = await fetch("https://quiniela.loteriadelaciudad.gob.ar/", {
      headers: { "User-Agent": rotationUA(), Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    })
    if (!homeR.ok) return null
    const homeHtml = await homeR.text()

    // Parse "Fecha: DD/MM/YYYY - Sorteo: NNNNN" from option values
    const [yyyy, mm, dd] = fechaISO.split("-")
    const targetDateStr = `${dd}/${mm}/${yyyy}` // DD/MM/YYYY format for CABA

    const optionRx = /value="?(\d+)"?[^>]*>Fecha:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*Sorteo:\s*\d+/g
    const turnoIdx = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"].indexOf(turno)
    let sorteoCode: number | null = null
    let m: RegExpExecArray | null

    // Collect all codes for the target date
    const dateCodes: number[] = []
    while ((m = optionRx.exec(homeHtml)) !== null) {
      if (m[2] === targetDateStr) {
        dateCodes.push(parseInt(m[1]))
      }
    }

    if (dateCodes.length >= 5) {
      // Codes are sorted descending in the dropdown, sort ascending
      dateCodes.sort((a, b) => a - b)
      sorteoCode = dateCodes[turnoIdx] ?? null
    }

    if (sorteoCode === null) return null

    // Step 2: Fetch the sorteo result
    const r = await fetch(
      "https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": rotationUA(),
          Referer: "https://quiniela.loteriadelaciudad.gob.ar/",
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
      html.includes("sin resultado") ||
      html.includes("No existen sortos")
    )
      return null

    // Extract position+number pairs: <div class="pos">01</div><div>5653</div>
    const pairRx = /<div\s+class\s*=\s*["']?pos["']?\s*>\s*(\d{1,2})\s*<\/div>\s*<div[^>]*>\s*(\d{3,4})\s*<\/div>/gi
    const pairs: { pos: number; num: number }[] = []
    let pmx: RegExpExecArray | null
    while ((pmx = pairRx.exec(html)) !== null) {
      const pos = parseInt(pmx[1])
      const num = parseInt(pmx[2])
      if (pos >= 1 && pos <= 20 && num >= 0 && num <= 9999) {
        pairs.push({ pos, num })
      }
    }
    if (pairs.length < 5) return null
    pairs.sort((a, b) => a.pos - b.pos)
    const seen = new Set<number>()
    const nums: number[] = []
    for (const p of pairs) {
      if (!seen.has(p.pos)) {
        seen.add(p.pos)
        nums.push(p.num)
      }
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

// ─── Source 3: QuinielaNacionalN (Homepage parser — HTTP only) ────────────────
// Parses all 5 turnos from https://quinielanacionaln.com.ar/ homepage
// Actual HTML structure:
//   <div id="Nocturna_5000001459" class="turno">
//     <h2>Sábado 15/08/26</h2>
//   </div>
//   <div class="columna">
//     <p class="h3">Nacional</p>
//     <div class="veintena">
//       <div class="orden">1</div><div class="numero">7647</div>
//       ...
//     </div>
//   </div>
// CRITICAL: Must validate that the HTML date matches the target date.
export async function parseQuinielaNacionalN(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const html = await (
      await fetch("https://quinielanacionaln.com.ar/", {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(10000),
      })
    ).text()

    // Step 1: Find turno section by id prefix: id="Nocturna_..."
    const turnoIdx = html.indexOf(`id="${turno}_`)
    if (turnoIdx < 0) return null

    // Step 2: Extract date from <h2> inside the turno div
    // <h2>S&aacute;bado 15/08/26</h2> — may have HTML entities
    const afterTurno = html.substring(turnoIdx, turnoIdx + 500)
    const dateMatch = afterTurno.match(/<h2>[^<]*?(\d{2})\/(\d{2})\/(\d{2})[^<]*<\/h2>/)
    if (!dateMatch) return null
    const [, dd, mm, yy] = dateMatch
    const htmlDate = `20${yy}-${mm}-${dd}`
    if (htmlDate !== fechaISO) {
      logger.debug("[scraper] parseQuinielaNacionalN: date mismatch", {
        htmlDate, targetDate: fechaISO, turno
      })
      return null
    }

    // Step 3: Find Nacional section after the turno header
    // Each turno div is self-closing: <div id="Nocturna_..." class="turno"><h2>...</h2></div>
    // Then comes <div class="columna"> with <p class="h3">Nacional</p> or <h3 class="h3">Nacional</h3>
    // We must find Nacional AFTER the turno's </div> to avoid matching previous turnos' Nacional
    const afterDate = html.substring(turnoIdx)

    // Find the turno's closing </div> first
    const turnoCloseDiv = afterDate.indexOf("</div>")
    if (turnoCloseDiv < 0) return null

    // Search for Nacional AFTER the turno div closes
    const searchStart = turnoCloseDiv
    let nacionalIdx = -1
    const h3Idx = afterDate.indexOf("Nacional</h3>", searchStart)
    const pIdx = afterDate.indexOf("Nacional</p>", searchStart)
    if (h3Idx >= 0 && pIdx >= 0) nacionalIdx = Math.min(h3Idx, pIdx)
    else if (h3Idx >= 0) nacionalIdx = h3Idx
    else if (pIdx >= 0) nacionalIdx = pIdx
    if (nacionalIdx < 0) return null

    // Step 4: Extract from Nacional to next .turno section or end
    const searchFrom = nacionalIdx + 10
    const nextTurnoIdx = afterDate.indexOf('class="turno"', searchFrom)
    const nextColumnaIdx = afterDate.indexOf('class="columna"', searchFrom)
    let endIdx = afterDate.length
    if (nextTurnoIdx > 0) endIdx = Math.min(endIdx, nextTurnoIdx)
    if (nextColumnaIdx > 0) endIdx = Math.min(endIdx, nextColumnaIdx)
    const chunk = afterDate.substring(nacionalIdx, endIdx)

    // Step 5: Extract orden+numero pairs: <div class="orden">1</div><div class="numero">7647</div>
    const pairRx = /class="orden">\s*(\d{1,2})\s*<\/div>\s*<div class="numero">\s*(\d{1,4})\s*<\/div>/gi
    const pairs: { pos: number; num: number }[] = []
    let pmx: RegExpExecArray | null
    while ((pmx = pairRx.exec(chunk)) !== null) {
      const pos = parseInt(pmx[1])
      const num = parseInt(pmx[2])
      if (pos >= 1 && pos <= 20 && num >= 0 && num <= 9999) {
        pairs.push({ pos, num })
      }
    }

    if (pairs.length >= 5) {
      pairs.sort((a, b) => a.pos - b.pos)
      const seen = new Set<number>()
      const nums: number[] = []
      for (const p of pairs) {
        if (!seen.has(p.pos)) {
          seen.add(p.pos)
          nums.push(p.num)
        }
      }
      if (nums.length >= 5) {
        return {
          numbers: nums,
          source: "quinielanacionaln.com.ar",
          cabezaMatch: null,
          duration: Date.now() - start,
          retries: 0,
        }
      }
    }

    // Fallback: extract any .numero values (without position)
    const numRx = /class="numero">\s*(\d{1,4})\s*<\/div>/gi
    const nums2: number[] = []
    let mx: RegExpExecArray | null
    while ((mx = numRx.exec(chunk)) !== null) {
      const n = parseInt(mx[1])
      if (n >= 0 && n <= 9999 && !nums2.includes(n)) nums2.push(n)
      if (nums2.length >= 20) break
    }
    if (nums2.length >= 5) {
      return {
        numbers: nums2,
        source: "quinielanacionaln.com.ar",
        cabezaMatch: null,
        duration: Date.now() - start,
        retries: 0,
      }
    }
  } catch (e) {
    logger.debug("[scraper] parseQuinielaNacionalN failed", { error: String(e) })
  }
  return null
}

// ─── Source 4: Lotería Santa Fe (Official — PrimeFaces) ──────────────────────
// HTML with <div class="numer">01</div> + <div class="numersorteo">6618</div>
// Each turno has a different URL
// CRITICAL: Must validate that the page date matches the target date.
export async function parseLoteriaSantaFe(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()

  const turnoUrls: Record<TurnoType, string> = {
    Previa: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarQuinielaLaPrevia.xhtml?display=0",
    Primera: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarQuinielaElPrimero.xhtml?display=0",
    Matutina: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarQuinielaMatutina.xhtml?display=0",
    Vespertina: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarQuinielaVespertina.xhtml?display=0",
    Nocturna: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarQuinielaNocturna.xhtml?display=0",
  }

  try {
    const url = turnoUrls[turno]
    const html = await (
      await fetch(url, {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(10000),
      })
    ).text()

    // Validate date: look for date patterns like "14 de Agosto de 2026" or "14/08/2026"
    const [yyyy, mm, dd] = fechaISO.split("-")
    const datePatterns = [
      `${dd}/${mm}/${yyyy}`,
      `${dd} de `,
    ]
    const htmlUpper = html.toUpperCase()
    const meses: Record<string, string> = {
      "01": "ENERO", "02": "FEBRERO", "03": "MARZO", "04": "ABRIL",
      "05": "MAYO", "06": "JUNIO", "07": "JULIO", "08": "AGOSTO",
      "09": "SEPTIEMBRE", "10": "OCTUBRE", "11": "NOVIEMBRE", "12": "DICIEMBRE",
    }
    const targetMonth = meses[mm] || ""
    const hasDate = htmlUpper.includes(dd) && htmlUpper.includes(targetMonth) && htmlUpper.includes(yyyy)
    if (!hasDate) {
      logger.debug("[scraper] parseLoteriaSantaFe: date mismatch", { targetDate: fechaISO, turno })
      return null
    }

    // Pattern: <div class="numer">01</div><div class="numersorteo">6618</div>
    const pairRx = /class="numer">\s*(\d{1,2})\s*<\/div>\s*<div class="numersorteo">\s*(\d{4})\s*<\/div>/gi
    const pairs: { pos: number; num: number }[] = []
    let pmx: RegExpExecArray | null
    while ((pmx = pairRx.exec(html)) !== null) {
      const pos = parseInt(pmx[1])
      const num = parseInt(pmx[2])
      if (pos >= 1 && pos <= 20 && num >= 0 && num <= 9999) {
        pairs.push({ pos, num })
      }
    }
    if (pairs.length < 5) return null
    pairs.sort((a, b) => a.pos - b.pos)
    const seen = new Set<number>()
    const nums: number[] = []
    for (const p of pairs) {
      if (!seen.has(p.pos)) {
        seen.add(p.pos)
        nums.push(p.num)
      }
    }
    if (nums.length < 5) return null
    return {
      numbers: nums,
      source: "loteriasantafe.gov.ar",
      cabezaMatch: null,
      duration: Date.now() - start,
      retries: 0,
    }
  } catch (e) {
    logger.debug("[scraper] parseLoteriaSantaFe failed", { error: String(e) })
    return null
  }
}

// ─── Cross-validation: Quiniela22 (cabeza only) ──────────────────────────────
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
