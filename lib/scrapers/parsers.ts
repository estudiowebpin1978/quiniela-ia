/**
 * Quiniela parsers — Multi-source with fallback cascade.
 * Each parser returns ScrapeResult with 20-number array or null on failure.
 * ALL parsers validate that the scraped date matches the target date.
 *
 * Sources (priority order):
 *   1. quiniela.loteriadelaciudad.gob.ar — Official API (PRIMARY, most reliable)
 *   2. quinieleando.com.ar              — Static HTML, all turnos
 *   3. loteria-ciudad.gob.ar            — Official CABA AJAX endpoint
 *   4. quinielanacionaln.com.ar         — HTTP homepage parser (FALLBACK)
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

// ─── Source 1: Official API (PRIMARY — most reliable) ─────────────────────────
// API: POST https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php
// Params: codigo=0080, jurisdiccion=51, sorteo={sorteoCode}
// Sorteo codes are sequential numbers found in the main page's select element
// Each day has 5 sorteo codes (one per turno), ordered: Previa < Primera < Matutina < Vespertina < Nocturna
const SORTEO_CACHE: { codes: Record<string, number[]>; fetchedAt: number } = { codes: {}, fetchedAt: 0 }
const SORTEO_CACHE_TTL = 60_000 // 1 minute

async function fetchSorteoCodes(): Promise<Record<string, number[]>> {
  const now = Date.now()
  if (SORTEO_CACHE.codes && Object.keys(SORTEO_CACHE.codes).length > 0 && now - SORTEO_CACHE.fetchedAt < SORTEO_CACHE_TTL) {
    return SORTEO_CACHE.codes
  }

  try {
    const resp = await fetch("https://quiniela.loteriadelaciudad.gob.ar/", {
      headers: { "User-Agent": rotationUA(), Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    })
    const html = await resp.text()

    // Extract select element with sorteo codes
    const selectMatch = html.match(/<select id='valor3'[^>]*>([\s\S]*?)<\/select>/i)
    if (!selectMatch) return {}

    const selectHtml = selectMatch[1]
    const optionRegex = /<option value=(\d+)>([^<]+)<\/option>/g
    const byDate: Record<string, number[]> = {}
    let match: RegExpExecArray | null

    while ((match = optionRegex.exec(selectHtml)) !== null) {
      const code = parseInt(match[1])
      const text = match[2]
      const dateMatch = text.match(/Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/)
      if (dateMatch) {
        const [, dd, mm, yyyy] = dateMatch
        const dateISO = `${yyyy}-${mm}-${dd}`
        if (!byDate[dateISO]) byDate[dateISO] = []
        byDate[dateISO].push(code)
      }
    }

    // Sort codes within each date (lowest = Previa, highest = Nocturna)
    for (const date of Object.keys(byDate)) {
      byDate[date].sort((a, b) => a - b)
    }

    SORTEO_CACHE.codes = byDate
    SORTEO_CACHE.fetchedAt = now
    return byDate
  } catch (e) {
    logger.warn("[scraper] fetchSorteoCodes failed", { error: String(e) })
    return {}
  }
}

function getTurnoSorteoIndex(turno: TurnoType): number {
  const map: Record<TurnoType, number> = {
    Previa: 0,
    Primera: 1,
    Matutina: 2,
    Vespertina: 3,
    Nocturna: 4,
  }
  return map[turno]
}

export async function parseOficial(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()

  try {
    const codesByDate = await fetchSorteoCodes()
    const codes = codesByDate[fechaISO]
    if (!codes || codes.length === 0) {
      logger.debug("[scraper] parseOficial: no sorteo codes for date", { fechaISO })
      return null
    }

    const turnoIdx = getTurnoSorteoIndex(turno)
    if (turnoIdx >= codes.length) {
      logger.debug("[scraper] parseOficial: not enough sorteo codes for turno", { fechaISO, turno, codesLen: codes.length })
      return null
    }

    const sorteoCode = codes[turnoIdx]

    // Call the official API
    const apiResp = await fetch(
      "https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": rotationUA(),
          "X-Requested-With": "XMLHttpRequest",
        },
        body: `codigo=0080&juridiccion=51&sorteo=${sorteoCode}`,
        signal: AbortSignal.timeout(6000),
      }
    )

    const html = await apiResp.text()

    if (html.includes("No hay Sorteo")) {
      logger.debug("[scraper] parseOficial: no sorteo available", { sorteoCode })
      return null
    }

    // Extract 4-digit numbers, filtering out year numbers
    const currentYear = new Date().getFullYear()
    const plainNumbers = html.match(/\b\d{4}\b/g) || []
    const nums: number[] = []
    for (const num of plainNumbers) {
      const n = parseInt(num)
      if (n >= 0 && n <= 9999 && !nums.includes(n) && n !== currentYear && n !== currentYear + 1) {
        nums.push(n)
      }
      if (nums.length >= 20) break
    }

    const duration = Date.now() - start

    if (nums.length >= 20) {
      logger.info("[scraper] parseOficial: success", {
        fechaISO,
        turno,
        sorteoCode,
        numbersCount: nums.length,
        duration,
      })
      return {
        numbers: nums,
        source: "oficial",
        cabezaMatch: null,
        duration,
        retries: 0,
      }
    }

    logger.debug("[scraper] parseOficial: insufficient numbers", {
      fechaISO,
      turno,
      sorteoCode,
      found: nums.length,
    })
    return null
  } catch (e) {
    logger.warn("[scraper] parseOficial failed", { error: String(e), duration: Date.now() - start })
    return null
  }
}

// ─── Source 2: Quinieleando (static HTML) ─────────────────────────────────────
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
          signal: AbortSignal.timeout(6000),
        })
      ).text()

      if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado"))
        continue

      // Find turno section: <h3>TURNO, Quiniela Nacional. DD/MM/YYYY</h3>
      // Must find the section header, not just the word in the <title> tag
      const turnoUpper = turno.toUpperCase()

      // Pattern 1: section header like "TURNO, Quiniela Nacional" (actual results)
      const turnoHeaders: Record<TurnoType, string[]> = {
        Previa: ["PREVIA, QUINIELA NACIONAL"],
        Primera: ["PRIMERA, QUINIELA NACIONAL", "EL PRIMERO, QUINIELA NACIONAL"],
        Matutina: ["MATUTINA, QUINIELA NACIONAL"],
        Vespertina: ["VESPERTINA, QUINIELA NACIONAL"],
        Nocturna: ["NOCTURNA, QUINIELA NACIONAL"],
      }

      // Parse target date as DD/MM/YYYY for header matching
      const [yyyy2, mm2, dd2] = fechaISO.split("-")
      const targetDateStr = `${parseInt(dd2)}/${parseInt(mm2)}/${yyyy2}`

      const headers = turnoHeaders[turno]
      let headerIdx = -1
      for (const h of headers) {
        // Search for all occurrences of this turno header and find one matching our date
        let searchFrom = 0
        while (searchFrom < html.length) {
          const idx = html.toUpperCase().indexOf(h, searchFrom)
          if (idx < 0) break
          // Check if the date in the header matches our target date
          const afterHeader = html.substring(idx, idx + h.length + 60)
          if (afterHeader.includes(targetDateStr)) {
            headerIdx = idx
            break
          }
          searchFrom = idx + h.length
        }
        if (headerIdx >= 0) break
      }
      if (headerIdx < 0) continue

      // Find the <table> that encloses this header.
      // Structure: <table>...<thead><h3>TURNO...</h3></thead><tr>data</tr>...</table>
      // Search backward for the last <table> before the header, then find its </table>
      let tableStart = -1
      let tableEnd = -1
      const searchWindow = html.substring(Math.max(0, headerIdx - 3000), headerIdx)
      const lastTablePos = searchWindow.lastIndexOf("<table")
      if (lastTablePos >= 0) {
        tableStart = Math.max(0, headerIdx - 3000) + lastTablePos
        tableEnd = html.indexOf("</table>", tableStart)
      }
      if (tableStart < 0 || tableEnd < 0) continue
      const tableChunk = html.substring(tableStart, tableEnd + 8)

      // Extract position+number pairs: handles both <td><span class="nro"><b>NNNN</b></span></td>
      // and <td><span class="nro">NNNN</span></td> and <td>NNNN</td>
      const pairRx = /<small>(\d{1,2})<\/small><\/td>\s*<td[^>]*>(?:<[^>]*>)*?(\d{4})(?:<\/[^>]*>)*?<\/td>/gi
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

      // Fallback: extract any 4-digit numbers in order from the table
      const numRx = /<td[^>]*>(?:<[^>]*>)*?(\d{4})(?:<\/[^>]*>)*?<\/td>/gi
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
      signal: AbortSignal.timeout(6000),
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
        signal: AbortSignal.timeout(6000),
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
        signal: AbortSignal.timeout(6000),
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
        signal: AbortSignal.timeout(6000),
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

// --- Source 6: NumerosEnvivo (JSON API — PRIMARY) ───────────────────────────
// Fetches structured JSON from embedded state or dedicated API
// API: https://numerosenvivo.com.ar/api/datos/quiniela/ciudad.json
// Supports date param: ?fecha=YYYY-MM-DD
export async function parseNumerosEnvivo(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const url = `https://numerosenvivo.com.ar/quiniela/ciudad?fecha=${fechaISO}`
    const resp = await fetch(url, {
      headers: { "User-Agent": rotationUA(), Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    const html = await resp.text()

    // Data is embedded as JSON in a <script> block:
    // window.__INITIAL_STATE__ = {...} or similar
    // Look for turno data with "numeros" array
    const turnoKey = turno === "Primera" ? "Primero" : turno
    // Pattern: "Vespertina":{"cabeza":"4086","numeros":["4086","6054",...],...}
    const jsonPattern = new RegExp(
      `"${turnoKey}"\\s*:\\s*\\{[^}]*"numeros"\\s*:\\s*\\[([^\\]]+)\\]`,
      "i"
    )
    const match = html.match(jsonPattern)
    if (!match) return null

    // Parse the numeros array (strings like "0395", "1635")
    const numsRaw = match[1].match(/\d{4}/g)
    if (!numsRaw || numsRaw.length < 5) return null

    const nums: number[] = []
    for (const n of numsRaw) {
      const parsed = parseInt(n)
      if (parsed >= 0 && parsed <= 9999 && !nums.includes(parsed)) nums.push(parsed)
      if (nums.length >= 20) break
    }

    if (nums.length >= 20) {
      return {
        numbers: nums,
        source: "numerosenvivo.com.ar",
        cabezaMatch: null,
        duration: Date.now() - start,
        retries: 0,
      }
    }

    // Fallback: try the dedicated JSON API
    const apiResp = await fetch("https://numerosenvivo.com.ar/api/datos/quiniela/ciudad.json", {
      headers: { "User-Agent": rotationUA() },
      signal: AbortSignal.timeout(6000),
    })
    if (apiResp.ok) {
      const jsonData = await apiResp.json()
      const turnoData = jsonData[turnoKey] || jsonData[turno]
      if (turnoData && Array.isArray(turnoData.numeros)) {
        const apiNums: number[] = []
        for (const n of turnoData.numeros) {
          const parsed = typeof n === "string" ? parseInt(n) : n
          if (parsed >= 0 && parsed <= 9999 && !apiNums.includes(parsed)) apiNums.push(parsed)
          if (apiNums.length >= 20) break
        }
        if (apiNums.length >= 20) {
          return {
            numbers: apiNums,
            source: "numerosenvivo.com.ar",
            cabezaMatch: null,
            duration: Date.now() - start,
            retries: 0,
          }
        }
      }
    }
  } catch (e) {
    logger.debug("[scraper] parseNumerosEnvivo failed", { error: String(e) })
  }
  return null
}

// --- Source 7: LoteriaMundiales (HTML tables — FALLBACK) ─────────────────────
// Flat table with time-based column headers: 10:15(Previa) 11:30(Primera) etc.
// Numbers are in <td> cells, 20 rows × 5 columns
// NOTE: Ads may break column alignment, so this is a FALLBACK source
// Supports date param: ?fecha=DD-MM-YYYY
export async function parseLoteriaMundiales(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const [yyyy, mm, dd] = fechaISO.split("-")
    const fechaParam = `${dd}-${mm}-${yyyy}`
    const url = `https://www.loteriasmundiales.com.ar/Quinielas/ciudad?fecha=${fechaParam}`
    const resp = await fetch(url, {
      headers: { "User-Agent": rotationUA(), Accept: "text/html" },
      signal: AbortSignal.timeout(6000),
    })
    if (!resp.ok) return null
    const html = await resp.text()

    // Validate date is present
    if (!html.includes(`${dd}/${mm}/${yyyy}`) && !html.includes(`${dd}-${mm}-${yyyy}`)) {
      return null
    }

    // Column index per turno
    const turnoIdxMap: Record<TurnoType, number> = {
      Previa: 0, Primera: 1, Matutina: 2, Vespertina: 3, Nocturna: 4,
    }
    const colIdx = turnoIdxMap[turno]

    // Find all tables and pick the one with QUINIELA data
    const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
    for (const tableMatch of tables) {
      const tableChunk = tableMatch[0]
      if (!tableChunk.toUpperCase().includes("QUINIELA")) continue

      // Extract all 3-4 digit numbers from td cells
      const allCells = [...tableChunk.matchAll(/<td[^>]*>(?:[\s\S]*?)?(\d{3,4})(?:[\s\S]*?)?<\/td>/gi)]
      const cellNums = allCells.map(m => parseInt(m[1])).filter(n => n >= 100 && n <= 9999)

      // Extract column for this turno (skip time headers, take every 5th from colIdx)
      const nums: number[] = []
      for (let i = 0; i < cellNums.length && nums.length < 20; i++) {
        if (i % 5 === colIdx) {
          const n = cellNums[i]
          if (!nums.includes(n)) nums.push(n)
        }
      }

      if (nums.length >= 20) {
        return {
          numbers: nums,
          source: "loteriasmundiales.com.ar",
          cabezaMatch: null,
          duration: Date.now() - start,
          retries: 0,
        }
      }
    }
  } catch (e) {
    logger.debug("[scraper] parseLoteriaMundiales failed", { error: String(e) })
  }
  return null
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
        signal: AbortSignal.timeout(6000),
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

// ─── Source 8: NacionalQuiniela.com (backup) ──────────────────────────────────
// Static HTML with all turnos. Position+number pairs separated by spaces.
// URL: /quiniela-nacional.php?del-dia=YYYY-MM-DD
export async function parseNacionalQuiniela(
  fechaISO: string,
  _fechaUrl: string,
  turno: TurnoType
): Promise<ScrapeResult | null> {
  const start = Date.now()
  try {
    const url = `https://www.nacionalquiniela.com/quiniela-nacional.php?del-dia=${fechaISO}`
    const html = await (
      await fetch(url, {
        headers: { "User-Agent": rotationUA(), Accept: "text/html" },
        signal: AbortSignal.timeout(6000),
      })
    ).text()

    // Date validation: check that the target date appears as DD/MM/YYYY or DD Month YYYY
    const [yyyy, mm, dd] = fechaISO.split("-")
    const monthNames = ["ENERO","FEBRERO","MARZO","ABRIL","MAYO","JUNIO","JULIO","AGOSTO","SEPTIEMBRE","OCTUBRE","NOVIEMBRE","DICIEMBRE"]
    const targetMonth = monthNames[parseInt(mm) - 1]
    const htmlUpper = html.toUpperCase()
    if (!htmlUpper.includes(dd) || !htmlUpper.includes(targetMonth) || !htmlUpper.includes(yyyy)) {
      return null
    }

    // Find turno section: "MATUTINA" followed by "N - Nombre" then position+number pairs
    const turnoHeaders: Record<TurnoType, string[]> = {
      Previa: ["PREVIA"],
      Primera: ["PRIMERA"],
      Matutina: ["MATUTINA"],
      Vespertina: ["VESPERTINA"],
      Nocturna: ["NOCTURNA"],
    }

    const headers = turnoHeaders[turno]
    let headerIdx = -1
    for (const h of headers) {
      // Search for turno header followed by a number (cabeza) to avoid matching navigation links
      const idx = htmlUpper.indexOf(h)
      if (idx >= 0) {
        // Verify it's followed by digits (the cabeza number), not a link
        const after = html.substring(idx + h.length, idx + h.length + 50)
        if (/^\s+\d{1,2}\s+-/.test(after)) {
          headerIdx = idx
          break
        }
      }
    }
    if (headerIdx < 0) return null

    // Extract the section from this turno header to the next turno or end
    const nextTurnos = ["PREVIA", "PRIMERA", "MATUTINA", "VESPERTINA", "NOCTURNA"]
    let sectionEnd = html.length
    for (const nt of nextTurnos) {
      if (nt === turno.toUpperCase()) continue
      const ntIdx = htmlUpper.indexOf(nt, headerIdx + 10)
      if (ntIdx > headerIdx && ntIdx < sectionEnd) sectionEnd = ntIdx
    }
    const section = html.substring(headerIdx, sectionEnd)

    // Parse position+number pairs: "  1 1892  2 6677  ..." or "1 1892  2 6677"
    const pairRx = /(\d{1,2})\s+(\d{4})/g
    const nums: number[] = []
    const seen = new Set<number>()
    let mx: RegExpExecArray | null
    while ((mx = pairRx.exec(section)) !== null) {
      const pos = parseInt(mx[1])
      const num = parseInt(mx[2])
      if (pos >= 1 && pos <= 20 && num >= 0 && num <= 9999 && !seen.has(pos)) {
        seen.add(pos)
        nums.push(num)
      }
      if (nums.length >= 20) break
    }

    const duration = Date.now() - start

    if (nums.length >= 20) {
      logger.info("[scraper] parseNacionalQuiniela: success", {
        fechaISO,
        turno,
        numbersCount: nums.length,
        duration,
      })
      return {
        numbers: nums,
        source: "nacionalquiniela.com",
        cabezaMatch: null,
        duration,
        retries: 0,
      }
    }

    logger.debug("[scraper] parseNacionalQuiniela: insufficient numbers", {
      fechaISO,
      turno,
      found: nums.length,
    })
    return null
  } catch (e) {
    logger.warn("[scraper] parseNacionalQuiniela failed", { error: String(e), duration: Date.now() - start })
    return null
  }
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
