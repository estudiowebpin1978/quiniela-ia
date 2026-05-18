import { NextRequest, NextResponse } from "next/server"

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64").toString("utf-8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

// Horarios de sorteo (hora Argentina, UTC-3)
const TURNO_HOURS: Record<string, number> = {
  "previa": 10,      // 10:15
  "primera": 12,    // 12:00
  "matutina": 15,  // 15:00
  "vespertina": 18, // 18:00
  "nocturna": 21,  // 21:00
}

const FERIADOS_2026 = [
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-24",
  "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25",
  "2026-06-20", "2026-07-09", "2026-12-08", "2026-12-25"
]

function isDiaSinSorteo(dateStr: string): boolean {
  const d = new Date(dateStr + "T12:00:00-03:00")
  const diaSemana = d.getDay()
  if (diaSemana === 0) return true // Domingo
  if (FERIADOS_2026.includes(dateStr)) return true
  return false
}

function hasDrawTimePassed(dateStr: string, turno: string): boolean {
  const turnoLower = turno.toLowerCase().replace(/-\d+cifras?$/i, "").trim()
  const hour = TURNO_HOURS[turnoLower]
  if (!hour) return true

  // Argentina es UTC-3. Para convertir a UTC sumamos 3h,
  // más un buffer para cuando los resultados se publican (~30min después)
  const bufferHoras: Record<string, number> = { "previa": 1, "primera": 1, "matutina": 1, "vespertina": 1, "nocturna": 3 }
  const addHours = (bufferHoras[turnoLower] ?? 2) + 3

  const [year, month, day] = dateStr.split("-").map(Number)
  const drawDate = new Date(Date.UTC(year, month - 1, day, hour + addHours, 0, 0))

  const now = new Date()
  return now > drawDate
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || ""
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || ""

  try {
    const userRes = await fetch(`${SB}/auth/v1/user`, {
      headers: { "apikey": SK, "Authorization": `Bearer ${token}` }
    })
    if (!userRes.ok) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const user = await userRes.json()
    if (!user?.id) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const userId = user.id;

    const predRes = await fetch(
      `${SB}/rest/v1/user_predictions?user_id=eq.${userId}&select=id,date,turno,numeros,created_at&order=created_at.desc&limit=30`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
    )
    const predictions = await predRes.json()
    console.log("GET predictions for user", userId, "count:", Array.isArray(predictions) ? predictions.length : "error", predictions)
    if (!Array.isArray(predictions)) return NextResponse.json({ predictions: [] })

    const results = []
    for (const pred of predictions) {
      const rawTurno = pred.turno || ""
      const turnoLower = rawTurno.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
      const predDate = (pred.date || "").trim()

      let draw: any = null
      
      // Verificar si ya pasó la hora del sorteo (y no es domingo/feriado)
      const drawTimePassed = hasDrawTimePassed(predDate, turnoLower) && !isDiaSinSorteo(predDate)

      if (drawTimePassed) {
        // Try with ilike for partial match
        const drawRes = await fetch(
          `${SB}/rest/v1/draws?date=eq.${predDate}&turno=ilike.*${turnoLower}*&select=numbers&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        )
        let draws = await drawRes.json()
        
        if (draws?.[0]) {
          draw = draws[0]
        } else {
          // Try searching by date only
          const drawRes2 = await fetch(
            `${SB}/rest/v1/draws?date=eq.${predDate}&select=numbers,turno&limit=10`,
            { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
          )
          const draws2 = await drawRes2.json()
          
          if (draws2?.length > 0) {
            // Find matching turno
            const matched = draws2.find((d: any) => 
              (d.turno || "").toLowerCase().includes(turnoLower) || 
              turnoLower.includes((d.turno || "").toLowerCase())
            )
            draw = matched || draws2[0]
          }
        }
      }

      let aciertos: any[] = []
      let numerosReales: string[] = []

      if (draw?.numbers && Array.isArray(draw.numbers)) {
        const digitCount = rawTurno.match(/-\d+cifras?$/i)?.[1] || "2"
        numerosReales = draw.numbers.map((n: number) => {
          const num = Number(n)
          if (digitCount === "2") return String(num % 100).padStart(2, "0")
          if (digitCount === "3") return String(num % 1000).padStart(3, "0")
          return String(num % 10000).padStart(4, "0")
        })
        
        const predNumeros = (pred.numeros || []).map((n: string) => {
          const s = String(n)
          if (digitCount === "2") return s.padStart(2, "0")
          if (digitCount === "3") return s.padStart(3, "0")
          return s.padStart(4, "0")
        })
        
        aciertos = predNumeros.filter((n: string) => numerosReales.includes(n)).map((n: string) => ({
          numero: n,
          puesto: numerosReales.indexOf(n) + 1
        }))
      }

      results.push({
        id: pred.id,
        fecha: pred.date,
        turno: pred.turno,
        numeros: pred.numeros,
        resultado: drawTimePassed && numerosReales.length > 0 ? numerosReales.slice(0, 20) : null,
        aciertos: drawTimePassed ? aciertos : [],
        acerto: drawTimePassed ? aciertos.length > 0 : false,
        created_at: pred.created_at,
        sorteoRealizado: drawTimePassed
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

  const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || ""
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || ""

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
      numeros: numeros
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
