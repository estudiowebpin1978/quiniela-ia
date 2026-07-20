import { ScrapeResult } from "./types"
import logger from "@/lib/logger"

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

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

// ─── Fuente 1: Lotería de la Ciudad (Oficial) ───────────────────────────────
// POST a PHP endpoint, HTML con <div class="pos">NN</div> seguido de <div>NNNN</div>
export async function parseLoteriaOficial(fechaISO: string, _fechaUrl: string, turno: string): Promise<ScrapeResult | null> {
  const refDate = new Date("2026-06-08T12:00:00Z")
  const targetDate = new Date(fechaISO + "T12:00:00Z")
  const daysDiff = Math.round((targetDate.getTime() - refDate.getTime()) / 86400000)
  let weekdays = 0
  for (let i = 1; i <= daysDiff; i++) {
    const d = new Date(refDate.getTime() + i * 86400000)
    if (d.getDay() === 0) continue
    const ds = d.toISOString().slice(0, 10)
    const isHoliday = (await import("@/lib/feriados")).esFeriado(ds)
    if (isHoliday) continue
    weekdays++
  }
  const turnoIdx = TURNOS.indexOf(turno)
  const sorteoCode = 52492 + weekdays * 5 + turnoIdx

  try {
    const r = await fetch("https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: `codigo=0080&juridiccion=51&sorteo=${sorteoCode}`,
      signal: AbortSignal.timeout(8000)
    })
    if (!r.ok) return null
    const html = await r.text()
    if (html.includes("No hay Sorteo") || html.includes("Sorteo no realizado") || html.includes("sin resultado")) return null

    // Tolerant: multiple patterns for class="pos" with optional extra classes/attributes
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
    return { numbers: nums, source: "loteria-ciudad.gob.ar", cabezaMatch: null }
  } catch (e) {
    logger.debug("[scraper] parseLoteriaOficial failed", { error: String(e) })
    return null
  }
}

// ─── Fuente 2: QuinielaNacional1 (Primaria rápida) ──────────────────────────
// HTML con <div class="veintena"> y <div class="numero">NNNN</div>
export async function parseQuinielaNacional1(_fechaISO: string, fechaUrl: string, turno: string): Promise<ScrapeResult | null> {
  const url = `https://quinielanacional1.com.ar/${fechaUrl}/${turno}`
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 3000))
    try {
      const html = await (await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
        signal: AbortSignal.timeout(8000)
      })).text()

      if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado")) return null

      // Tolerant veintena lookup: try multiple patterns
      let veintenaIdx = html.indexOf('class="veintena"')
      if (veintenaIdx < 0) veintenaIdx = html.indexOf("class='veintena'")
      if (veintenaIdx < 0) veintenaIdx = html.search(/class\s*=\s*["']veintena["']/)
      if (veintenaIdx < 0) continue

      const chunk = html.slice(veintenaIdx, veintenaIdx + 5000)
      // Tolerant numero regex: allows extra classes, nested tags
      const rx = /class\s*=\s*["']?numero["']?\s*>\s*(?:<(?:b|strong|span)[^>]*>)?\s*(\d{1,4})\s*(?:<\/(?:b|strong|span)>)?\s*<\/div>/gi
      const nums = extractNums(chunk, rx)
      if (nums.length >= 5) {
        return { numbers: nums, source: "quinielanacional1.com.ar", cabezaMatch: null }
      }
    } catch (e) {
      logger.debug("[scraper] parseQuinielaNacional1 attempt failed", { intento, error: String(e) })
    }
  }
  return null
}

// ─── Fuente 3: Quinieleando (Fallback 1) ─────────────────────────────────────
// HTML con <span class="nro"><b>NNNN</b></span> (cabeza) y <span class="nro">NNNN</span>
export async function parseQuinieleando(fechaISO: string, _fechaUrl: string, turno: string): Promise<ScrapeResult | null> {
  try {
    const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
    if (fechaISO !== hoy) return null

    const url = `https://quinieleando.com.ar/quinielas/nacional/resultados-de-hoy`
    const html = await (await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
      signal: AbortSignal.timeout(8000)
    })).text()

    if (html.includes("Sorteo no realizado") || html.includes("sorteo no realizado")) return null

    const turnoUpper = turno.toUpperCase()
    // Tolerant header regex: allows extra whitespace, different separators, optional text
    const turnoHeaderRx = new RegExp(
      `<h3>\\s*${turnoUpper}\\s*[,:;\\-]?\\s*Quiniela\\s*Nacional[^<]*<\\/h3>`,
      "gi"
    )
    const headerMx = turnoHeaderRx.exec(html)
    if (!headerMx) return null

    const afterHeader = html.slice(headerMx.index, headerMx.index + 6000)
    const tableEnd = afterHeader.indexOf("</table>")
    const chunk = tableEnd > 0 ? afterHeader.slice(0, tableEnd) : afterHeader.slice(0, 4000)

    // Tolerant number regex: allows optional classes, nested tags, whitespace
    const rx = /class\s*=\s*["']nro["']\s*>\s*(?:<(?:b|strong|span)[^>]*>)?\s*(\d{1,4})\s*(?:<\/(?:b|strong|span)>)?\s*<\/span>/gi
    const nums = extractNums(chunk, rx)
    if (nums.length >= 5) {
      return { numbers: nums, source: "quinieleando.com.ar", cabezaMatch: null }
    }
  } catch (e) {
    logger.debug("[scraper] parseQuinieleando failed", { error: String(e) })
  }
  return null
}

// ─── Fuente 4: Quiniela22 (Fallback 2 - solo cabeza) ────────────────────────
// Solo tiene la cabeza (1 número), útil para cross-validation
export async function parseQuiniela22Cabeza(_fechaISO: string, fechaUrl: string, turno: string): Promise<number | null> {
  try {
    const [dd, mm, yy] = fechaUrl.split("-")
    const dayNames = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"]
    const d = new Date(`20${yy}-${mm}-${dd}T12:00:00Z`)
    const dayName = dayNames[d.getUTCDay()]
    const url = `https://quiniela22.com/${turno}/Ciudad/${dayName}_${fechaUrl}`
    const html = await (await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
      signal: AbortSignal.timeout(8000)
    })).text()
    // Tolerant: allows extra attributes on <a> tag, optional whitespace
    const rx = /class\s*=\s*["']num["']\s*>\s*<a[^>]*>\s*(\d{3,4})\s*<\/a>\s*<\/div>/gi
    const mx = rx.exec(html)
    if (mx) return parseInt(mx[1])
  } catch (e) {
    logger.debug("[scraper] parseQuiniela22Cabeza failed", { error: String(e) })
  }
  return null
}

// ─── Verificador de cabeza ───────────────────────────────────────────────────
export async function verifyCabeza(fechaUrl: string, turno: string, expectedNum: number): Promise<boolean | null> {
  const cabeza = await parseQuiniela22Cabeza("", fechaUrl, turno)
  if (cabeza === null) return null
  return cabeza === expectedNum
}
