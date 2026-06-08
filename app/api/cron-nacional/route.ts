import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

function fechaArgentina(fecha?: string): { fechaStr: string; diaSemana: number; fUrl: string } {
  if (fecha) {
    const [y, m, d] = fecha.split("-")
    return { fechaStr: fecha, diaSemana: new Date(`${fecha}T12:00:00Z`).getDay(), fUrl: `${d}-${m}-${y.slice(-2)}` }
  }
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

function extraerNumeros(html: string, startIdx: number): number[] {
  const chunk = html.slice(startIdx, startIdx + 4000)
  const nums: number[] = []
  const rx = /class="numero">(\d{4})<\/div>/g
  let mx: RegExpExecArray | null
  while ((mx = rx.exec(chunk)) !== null) {
    const n = parseInt(mx[1])
    if (n >= 0 && n <= 9999 && !nums.includes(n)) nums.push(n)
    if (nums.length >= 20) break
  }
  return nums
}

async function scrapeUrl(url: string): Promise<number[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
      "Referer": "https://quinielanacional1.com.ar/",
    },
    signal: AbortSignal.timeout(20000)
  })
  if (!res.ok) return []
  return extraerNumeros(await res.text(), 0)
}

async function scrapeTurno(fechaUrl: string, turno: string): Promise<number[]> {
  const url = `https://quinielanacional1.com.ar/${fechaUrl}/${turno}`
  const delays = [0, 3000, 10000]

  for (let intento = 0; intento < 3; intento++) {
    if (delays[intento] > 0) await new Promise(r => setTimeout(r, delays[intento]))
    try {
      const html = await (await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
          "Referer": "https://quinielanacional1.com.ar/",
        },
        signal: AbortSignal.timeout(20000)
      })).text()

      const nacionalMark = '<p class="h3">Nacional</p>'
      const nacionalIdx = html.indexOf(nacionalMark)
      if (nacionalIdx < 0) {
        if (intento < 2) continue
        const idx = html.indexOf('class="veintena"')
        return idx < 0 ? [] : extraerNumeros(html, idx)
      }

      const afterNacional = html.slice(nacionalIdx)
      const veintenaIdx = afterNacional.indexOf('class="veintena"')
      if (veintenaIdx < 0) {
        if (intento < 2) continue
        return []
      }

      const nums = extraerNumeros(afterNacional, veintenaIdx)
      if (nums.length >= 20) return nums
      if (intento < 2) continue
      return nums
    } catch {
      if (intento >= 2) return []
    }
  }
  return []
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

async function backfillDiasFaltantes(hoy: string, expected: string, cronSecret: string): Promise<number> {
  let backfilled = 0
  for (let d = 1; d <= 3; d++) {
    const f = new Date(hoy + "T12:00:00-03:00")
    f.setDate(f.getDate() - d)
    const fechaStr = f.toISOString().split("T")[0]
    const { diaSemana, fUrl } = fechaArgentina(fechaStr)
    if (esDiaSinSorteo(diaSemana, fechaStr)) continue

    for (const turno of TURNOS) {
      if (turno === "Previa" && diaSemana === 6) continue
      if (await tieneDraw(fechaStr, turno)) continue

      const nums = await scrapeTurno(fUrl, turno)
      if (nums.length >= 20) {
        await guardarDraw(fechaStr, turno, nums)
        backfilled++
        console.log(`[BACKFILL] ${fechaStr} ${turno}: ${nums.length} numeros`)
        fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"}/api/cron-push?secret=${cronSecret}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ turno, numeros: nums, fecha: fechaStr })
        }).catch(() => {})
      }
    }
  }
  return backfilled
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET
  if (!expected) return NextResponse.json({ error: "CRON_SECRET no configurado" }, { status: 500 })
  if (secret !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const save = req.nextUrl.searchParams.get("save") === "true"
  const turnoParam = req.nextUrl.searchParams.get("turno") || ""
  const dateParam = req.nextUrl.searchParams.get("date") || ""

  const ahora = dateParam ? fechaArgentina(dateParam) : fechaArgentina()
  const { fechaStr: fechaISO, diaSemana, fUrl } = ahora

  if (esDiaSinSorteo(diaSemana, fechaISO)) {
    console.log(`[CRON] Sin sorteos ${fechaISO} (${diaSemana === 0 ? "Domingo" : "Feriado"})`)
    return NextResponse.json({ ok: false, message: "Sin sorteos", guardados: 0 })
  }

  const turnosAEvaluar = turnoParam
    ? TURNOS.filter(t => t.toLowerCase() === turnoParam.toLowerCase())
    : TURNOS

  // Fetch ALL turnos en PARALELO
  const promises = turnosAEvaluar.map(async (turno) => {
    if (turno === "Previa" && diaSemana === 6) return { turno, nums: [] as number[], ok: false }
    const nums = await scrapeTurno(fUrl, turno)
    return { turno, nums, ok: nums.length >= 5 }
  })

  const resultadosArr = await Promise.all(promises)
  let totalGuardados = 0

  for (const { turno, nums } of resultadosArr) {
    if (nums.length >= 5) {
      if (save) {
        if (await guardarDraw(fechaISO, turno, nums)) {
          totalGuardados++
          fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"}/api/cron-push?secret=${expected}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ turno, numeros: nums, fecha: fechaISO })
          }).catch(() => {})
        }
      }
    }
  }

  // BACKFILL: completar sorteos faltantes de los ultimos 3 dias
  let backfilled = 0
  if (save) {
    backfilled = await backfillDiasFaltantes(fechaISO, expected, secret)
  }

  const resultados: Record<string, number[]> = {}
  for (const r of resultadosArr) {
    if (r.nums.length >= 5) resultados[r.turno] = r.nums
  }

  return NextResponse.json({
    ok: true, fecha: fechaISO, turnos: Object.keys(resultados),
    guardados: totalGuardados, backfilled, resultados
  })
}
