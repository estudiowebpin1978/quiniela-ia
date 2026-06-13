/**
 * Fast scraper endpoint - solo scrapea turnos de HOY.
 * Diseñado para ser llamado cada 15 min por cron-job.org o Vercel Cron.
 * No hace backfill (para eso usar /api/cron-nacional?fill=deep).
 */

import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

function fechaArgentina(): { fechaStr: string; diaSemana: number; fUrl: string } {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit" }).format()
  const [yyyy, mm, dd] = p.split("-")
  return { fechaStr: p, diaSemana: new Date(`${p}T12:00:00Z`).getDay(), fUrl: `${dd}-${mm}-${yyyy.slice(-2)}` }
}

const FERIADOS = ["01-01","02-16","02-17","03-24","04-02","04-03","05-01","05-25","06-20","07-09","08-17","10-12","11-23","12-08","12-25"]

function esDiaSinSorteo(diaSemana: number, fechaStr: string): boolean {
  if (diaSemana === 0) return true
  if (FERIADOS.includes(fechaStr.slice(5))) return true
  return false
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
      const rx = /class="numero">(\d{4})<\/div>/g
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

async function guardarDraw(fechaISO: string, turno: string, nums: number[]): Promise<boolean> {
  await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}`, {
    method: "DELETE",
    headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Prefer": "return=minimal" }
  })
  const r = await fetch(`${SB()}/rest/v1/draws`, {
    method: "POST",
    headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
    body: JSON.stringify({ date: fechaISO, turno, numbers: nums, source: "quiniela-nacional.com" })
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

  const { fechaStr: fechaISO, diaSemana, fUrl } = fechaArgentina()

  if (esDiaSinSorteo(diaSemana, fechaISO)) {
    return NextResponse.json({ ok: true, message: "Sin sorteos", fecha: fechaISO })
  }

  // Solo scrapeamos turnos que NO tenemos en la DB
  const resultados: Record<string, number[]> = {}
  let guardados = 0

  for (const turno of TURNOS) {
    if (turno === "Previa" && diaSemana === 6) continue
    if (await tieneDraw(fechaISO, turno)) continue

    const nums = await scrapeTurnoFast(fUrl, turno)
    if (nums.length >= 5) {
      if (await guardarDraw(fechaISO, turno, nums)) {
        guardados++
        resultados[turno] = nums
      }
    }
  }

  // Limpiar predicciones de usuarios mayores a 24hs
  let eliminadas = 0
  try { eliminadas = await limpiarPrediccionesViejas() } catch {}

  return NextResponse.json({
    ok: true,
    fecha: fechaISO,
    guardados,
    eliminadas,
    resultados,
    message: guardados > 0 ? `${guardados} sorteos guardados` : "Sin nuevos sorteos"
  })
}
