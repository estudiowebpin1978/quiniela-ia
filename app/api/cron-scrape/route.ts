/**
 * Fast scraper endpoint - solo scrapea turnos de HOY.
 * Diseñado para ser llamado cada 15 min por cron-job.org o Vercel Cron.
 * No hace backfill (para eso usar /api/cron-nacional?fill=deep).
 */

import { NextRequest, NextResponse } from "next/server"
import { esDiaSinSorteo } from "@/lib/feriados"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

function fechaArgentina(): { fechaStr: string; diaSemana: number; fUrl: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
  const [yyyy, mm, dd] = p.split("-")
  return { fechaStr: p, diaSemana: new Date(`${p}T12:00:00Z`).getDay(), fUrl: `${dd}-${mm}-${yyyy.slice(-2)}` }
}

async function scrapeTurnoOficial(fechaISO: string, turno: string): Promise<number[]> {
  // Lotería de la Ciudad - API oficial
  // Reference: 2026-06-08 (Mon) = sorteo 52492, each weekday +5 sorteos
  // Sundays and holidays have no sorteos
  const refDate = new Date("2026-06-08T12:00:00Z")
  const targetDate = new Date(fechaISO + "T12:00:00Z")
  const daysDiff = Math.round((targetDate.getTime() - refDate.getTime()) / (86400000))
  // Count only weekdays (Mon-Sat), skip Sundays
  let weekdays = 0
  for (let i = 1; i <= daysDiff; i++) {
    const d = new Date(refDate.getTime() + i * 86400000)
    if (d.getDay() !== 0) weekdays++ // skip Sunday
  }
  const turnoIdx = TURNOS.indexOf(turno)
  if (turnoIdx < 0) return []
  const sorteoCode = 52492 + weekdays * 5 + turnoIdx

  try {
    const r = await fetch("https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "Mozilla/5.0" },
      body: `codigo=0080&juridiccion=51&sorteo=${sorteoCode}`,
      signal: AbortSignal.timeout(15000)
    })
    if (!r.ok) return []
    const html = await r.text()
    if (html.includes("No hay Sorteo")) return []

    const nums: number[] = []
    const rx = /<div class="pos">(\d{2})<\/div><div>(\d{4})<\/div>/g
    let mx: RegExpExecArray | null
    while ((mx = rx.exec(html)) !== null) {
      const n = parseInt(mx[2])
      if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
      if (nums.length >= 20) break
    }
    return nums
  } catch { return [] }
}

async function scrapeTurnoFast(fechaUrl: string, turno: string): Promise<number[]> {
  const url = `https://quinielanacional1.com.ar/${fechaUrl}/${turno}`
  for (let intento = 0; intento < 2; intento++) {
    if (intento > 0) await new Promise(r => setTimeout(r, 3000))
    try {
      const html = await (await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0", "Accept": "text/html" },
        signal: AbortSignal.timeout(15000)
      })).text()

      const nacionalMark = '<p class="h3">Nacional</p>'
      const ciudadMark = '<p class="h3">Ciudad</p>'
      let sectionIdx = html.indexOf(nacionalMark)
      if (sectionIdx < 0) sectionIdx = html.indexOf(ciudadMark)
      if (sectionIdx < 0) continue

      const afterSection = html.slice(sectionIdx)
      const veintenaIdx = afterSection.indexOf('class="veintena"')
      if (veintenaIdx < 0) continue

      const chunk = afterSection.slice(veintenaIdx, veintenaIdx + 4000)
      const nums: number[] = []
      const rx = /class="numero">(\d{3,4})<\/div>/g
      let mx: RegExpExecArray | null
      while ((mx = rx.exec(chunk)) !== null) {
        const n = parseInt(mx[1])
        if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
        if (nums.length >= 20) break
      }
      if (nums.length >= 5) return nums
    } catch {}
  }
  return []
}

async function tieneDraw(fechaISO: string, turno: string): Promise<boolean> {
  try {
    const r = await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=id&limit=1`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` },
      signal: AbortSignal.timeout(5000)
    })
    const d = await r.json()
    return Array.isArray(d) && d.length > 0
  } catch { return false }
}

async function guardarDraw(fechaISO: string, turno: string, nums: number[], source: string = "quiniela-nacional.com"): Promise<boolean> {
  await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}`, {
    method: "DELETE",
    headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Prefer": "return=minimal" }
  })
  const r = await fetch(`${SB()}/rest/v1/draws`, {
    method: "POST",
    headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ date: fechaISO, turno, numbers: nums, source })
  })
  return r.ok
}

async function limpiarPrediccionesViejas(): Promise<number> {
  const hace24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  try {
    const r = await fetch(
      `${SB()}/rest/v1/user_predictions?created_at=lt.${hace24h}&select=id`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
    )
    const old = await r.json()
    if (!Array.isArray(old) || old.length === 0) return 0
    const ids = old.map((p: any) => p.id)
    const d = await fetch(
      `${SB()}/rest/v1/user_predictions?id=in.(${ids.join(",")})`,
      { method: "DELETE", headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Prefer": "return=minimal" }, signal: AbortSignal.timeout(8000) }
    )
    return d.ok ? ids.length : 0
  } catch { return 0 }
}

export async function GET(req: NextRequest) {
  const isVercelCron = req.headers.get("x-vercel-cron") === "1"
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && !(secret && expected && secret === expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const overrideDate = req.nextUrl.searchParams.get("date")
  let fechaISO: string, diaSemana: number, fUrl: string

  if (overrideDate && /^\d{4}-\d{2}-\d{2}$/.test(overrideDate)) {
    const [yyyy, mm, dd] = overrideDate.split("-")
    fechaISO = overrideDate
    diaSemana = new Date(`${overrideDate}T12:00:00Z`).getDay()
    fUrl = `${dd}-${mm}-${yyyy.slice(-2)}`
  } else {
    const f = fechaArgentina()
    fechaISO = f.fechaStr
    diaSemana = f.diaSemana
    fUrl = f.fUrl
  }

  if (!overrideDate && esDiaSinSorteo(fechaISO, diaSemana)) {
    return NextResponse.json({ ok: true, message: "Sin sorteos", fecha: fechaISO })
  }

  // Solo scrapeamos turnos que NO tenemos en la DB
  const resultados: Record<string, number[]> = {}
  let guardados = 0

  for (const turno of TURNOS) {
    if (await tieneDraw(fechaISO, turno)) continue

    let nums = await scrapeTurnoFast(fUrl, turno)
    let source = "quiniela-nacional1.com.ar"
    if (nums.length < 5) {
      nums = await scrapeTurnoOficial(fechaISO, turno)
      if (nums.length >= 5) source = "loteria-ciudad.gob.ar"
    }
    if (nums.length >= 5) {
      if (await guardarDraw(fechaISO, turno, nums, source)) {
        guardados++
        resultados[turno] = nums
      }
    }
  }

  // Limpiar predicciones de usuarios mayores a 24hs
  let eliminadas = 0
  try { eliminadas = await limpiarPrediccionesViejas() } catch {}

  // Auto-train ML models in background after scraping new draws
  if (guardados > 0) {
    import("@/lib/ml/auto-train").then(m => m.autoTrainAll()).catch(() => {})
  }

  return NextResponse.json({
    ok: true,
    fecha: fechaISO,
    guardados,
    eliminadas,
    resultados,
    message: guardados > 0 ? `${guardados} sorteos guardados` : "Sin nuevos sorteos"
  })
}
