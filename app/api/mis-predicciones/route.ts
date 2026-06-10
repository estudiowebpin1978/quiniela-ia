import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNO_HOURS: Record<string, number> = {
  "previa": 10, "primera": 12, "matutina": 15, "vespertina": 18, "nocturna": 21,
}

const FERIADOS_2026 = [
  "2026-01-01","2026-02-16","2026-02-17","2026-03-24",
  "2026-04-02","2026-04-03","2026-05-01","2026-05-25",
  "2026-06-20","2026-07-09","2026-08-17","2026-10-12",
  "2026-11-23","2026-12-08","2026-12-25",
]

function isDiaSinSorteo(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00-03:00")
  if (d.getDay() === 0) return true
  if (FERIADOS_2026.includes(dateStr)) return true
  return false
}

// Primero busca en DB, si hay resultados ya estan disponibles.
// Si no hay en DB, usa time check con buffer minimo.
async function checkResultadosEnDB(dateStr: string, turno: string): Promise<{ disponible: boolean; numeros?: number[] }> {
  try {
    const res = await fetch(
      `${SB()}/rest/v1/draws?date=eq.${dateStr}&turno=ilike.*${turno}*&select=numbers&limit=1`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(5000) }
    )
    if (!res.ok) return { disponible: false }
    const draws = await res.json()
    if (draws?.[0]?.numbers && Array.isArray(draws[0].numbers) && draws[0].numbers.length >= 5) {
      return { disponible: true, numeros: draws[0].numbers }
    }
  } catch {}
  return { disponible: false }
}

async function hasResultadosDisponibles(dateStr: string, turnoLower: string): Promise<boolean> {
  if (isDiaSinSorteo(dateStr)) return false
  // Si ya estan en DB, disponibles inmediatamente
  const enDB = await checkResultadosEnDB(dateStr, turnoLower)
  if (enDB.disponible) return true
  // Fallback: check time buffer (15min despues de la hora del sorteo)
  const hour = TURNO_HOURS[turnoLower]
  if (!hour) return true
  const [y, m, d] = dateStr.split("-").map(Number)
  const drawDate = new Date(Date.UTC(y, m - 1, d, hour + 3, 15, 0)) // UTC+3 + 15min buffer
  return new Date() > drawDate
}

async function buscarDraw(dateStr: string, turnoLower: string): Promise<any> {
  const res = await fetch(
    `${SB()}/rest/v1/draws?date=eq.${dateStr}&turno=ilike.*${turnoLower}*&select=numbers&limit=1`,
    { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` } }
  )
  let draws = await res.json()
  if (draws?.[0]) return draws[0]
  // Fallback: buscar por fecha
  const res2 = await fetch(
    `${SB()}/rest/v1/draws?date=eq.${dateStr}&select=numbers,turno&limit=10`,
    { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` } }
  )
  const draws2 = await res2.json()
  if (draws2?.length > 0) {
    return draws2.find((d: any) =>
      (d.turno || "").toLowerCase().includes(turnoLower) ||
      turnoLower.includes((d.turno || "").toLowerCase())
    ) || null
  }
  return null
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const userRes = await fetch(`${SB()}/auth/v1/user`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${token}` }
    })
    if (!userRes.ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const user = await userRes.json()
    if (!user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const userId = user.id

    const predRes = await fetch(
      `${SB()}/rest/v1/user_predictions?user_id=eq.${userId}&select=id,date,turno,numeros,created_at&order=created_at.desc&limit=30`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` } }
    )
    const predictions = await predRes.json()
    console.log(`mis-predicciones: ${userId} → ${predRes.status}, predictions=${Array.isArray(predictions) ? predictions.length : typeof predictions}`)
    if (!Array.isArray(predictions)) {
      console.error("mis-predicciones error:", JSON.stringify(predictions).slice(0, 200))
      return NextResponse.json({ predictions: [] })
    }
    if (predictions.length === 0) {
      console.log("mis-predicciones: no predictions found for user", userId)
    }

    const results = []
    for (const pred of predictions) {
      const rawTurno = pred.turno || ""
      const turnoLower = rawTurno.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
      const predDate = (pred.date || "").trim()

      const disponible = await hasResultadosDisponibles(predDate, turnoLower)
      const draw: any = disponible ? await buscarDraw(predDate, turnoLower) : null

      let aciertos: any[] = []
      let numerosReales: string[] = []
      let pred3: string[] = []
      let pred4: string[] = []

      // Handle both flat array (free users) and structured object (premium users) formats
      const pred2 = Array.isArray(pred.numeros) ? pred.numeros : (pred.numeros?.["2"] || [])
      if (!Array.isArray(pred.numeros)) {
        pred3 = pred.numeros?.["3"] || []
        pred4 = pred.numeros?.["4"] || []
      }

      if (draw?.numbers && Array.isArray(draw.numbers)) {
        const digitCount = rawTurno.match(/-\d+cifras?$/i)?.[1] || "2"
        numerosReales = draw.numbers.map((n: number) => {
          const num = Number(n)
          return String(num % (digitCount === "2" ? 100 : digitCount === "3" ? 1000 : 10000)).padStart(Number(digitCount) || 2, "0")
        })
        const predNumeros = pred2.map((n: string) => String(n).padStart(Number(digitCount) || 2, "0"))
        aciertos = predNumeros.filter((n: string) => numerosReales.includes(n)).map((n: string) => ({
          numero: n,
          puesto: numerosReales.indexOf(n) + 1
        }))
      }

      results.push({
        id: pred.id, fecha: pred.date, turno: pred.turno,
        numeros: pred2,
        numeros_3: pred3,
        numeros_4: pred4,
        resultado: disponible && numerosReales.length > 0 ? numerosReales.slice(0, 10) : null,
        aciertos: disponible ? aciertos : [],
        acerto: disponible ? aciertos.length > 0 : false,
        created_at: pred.created_at,
        sorteoRealizado: !!draw
      })
    }

    return NextResponse.json({ predictions: results })
  } catch (e: any) {
    return NextResponse.json({ predictions: [], error: e.message })
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

  try {
    const userRes = await fetch(`${SB}/auth/v1/user`, {
      headers: { "apikey": SK, "Authorization": `Bearer ${token}` }
    })
    if (!userRes.ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const user = await userRes.json()
    if (!user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const userId = user.id;

    const { date, turno, numeros } = await req.json()
    if (!date || !turno || !numeros?.length) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
    }

    const checkRes = await fetch(
      `${SB}/rest/v1/user_predictions?user_id=eq.${userId}&date=eq.${date}&turno=eq.${turno}&select=id&limit=1`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
    )
    const existing = await checkRes.json()
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ error: "Ya guardaste una predicción para este turno", duplicate: true }, { status: 409 })
    }

    const insertData: any = {
      user_id: userId,
      date: date,
      turno: turno,
      numeros: numeros,
    }

    const r = await fetch(`${SB}/rest/v1/user_predictions`, {
      method: "POST",
      headers: {
        "apikey": SK,
        "Authorization": `Bearer ${SK}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(insertData)
    })

    const responseText = await r.text()
    console.log("Insert result:", r.status, responseText)

    if (!r.ok) {
      return NextResponse.json({ error: "Error guardando. Status: " + r.status + ". Response: " + responseText }, { status: 500 })
    }

    let inserted = null
    try { inserted = JSON.parse(responseText) } catch {}

    console.log("Inserted record:", inserted)
    return NextResponse.json({ ok: true, inserted })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
