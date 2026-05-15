import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

function formatISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

function fechaUrl(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yy = String(d.getFullYear()).slice(-2)
  return `${dd}-${mm}-${yy}`
}

async function scrapeTurno(fechaUrl: string, turno: string): Promise<number[]> {
  try {
    const res = await fetch(`https://quinielanacional1.com.ar/${fechaUrl}/${turno}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer": "https://quinielanacional1.com.ar/",
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return []

    const html = await res.text()
    const idx = html.indexOf('class="veintena"')
    if (idx < 0) return []

    const chunk = html.slice(idx, idx + 4000)
    const nums: number[] = []
    const rx = /class="numero">(\d{4})<\/div>/g
    let mx: RegExpExecArray | null
    while ((mx = rx.exec(chunk)) !== null) {
      const n = parseInt(mx[1])
      if (n >= 0 && n <= 9999 && nums.indexOf(n) === -1) nums.push(n)
      if (nums.length >= 20) break
    }
    return nums
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"

  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const save = req.nextUrl.searchParams.get("save") === "true"
  const turnoParam = req.nextUrl.searchParams.get("turno") || ""
  const dateParam = req.nextUrl.searchParams.get("date") || ""

  const ahora = dateParam
    ? new Date(dateParam + "T00:00:00")
    : new Date(Date.now() - 3 * 3600000)
  const diaSemana = ahora.getDay()
  const fechaISO = formatISO(ahora)
  const fUrl = fechaUrl(ahora)

  const feriados2026 = [
    "01-01", "02-16", "02-17", "03-24", "04-02", "04-03",
    "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"
  ]
  const fechaHoy = `${String(ahora.getMonth() + 1).padStart(2, "0")}-${String(ahora.getDate()).padStart(2, "0")}`

  if (diaSemana === 0) {
    return NextResponse.json({ ok: false, message: "Domingo - No hay sorteos", guardados: 0 })
  }
  if (feriados2026.includes(fechaHoy)) {
    return NextResponse.json({ ok: false, message: `Feriado ${fechaHoy} - No hay sorteos`, guardados: 0 })
  }

  const turnosAEvaluar = turnoParam
    ? TURNOS.filter(t => t.toLowerCase() === turnoParam.toLowerCase())
    : TURNOS

  const resultados: Record<string, number[]> = {}
  let totalGuardados = 0

  for (const turno of turnosAEvaluar) {
    const nums = await scrapeTurno(fUrl, turno)
    if (nums.length >= 5) {
      resultados[turno] = nums

      if (save) {
        await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}`, {
          method: "DELETE",
          headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Prefer": "return=minimal" }
        })
        const r = await fetch(`${SB()}/rest/v1/draws`, {
          method: "POST",
          headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify({ date: fechaISO, turno, numbers: nums, source: "quiniela-nacional.com" })
        })
        if (r.ok) totalGuardados++
      }
    }
  }

  return NextResponse.json({
    ok: true,
    fecha: fechaISO,
    turnos: Object.keys(resultados),
    guardados: totalGuardados,
    resultados
  })
}
