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
      const turnoLower = (pred.turno || "").toLowerCase().trim()
      const predDate = (pred.date || "").trim()
      
      let draw: any = null
      
      // Try exact match first
      const drawRes = await fetch(
        `${SB}/rest/v1/draws?date=eq.${predDate}&turno=eq.${turnoLower}&select=numbers&limit=1`,
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
          draw = draws2.find((d: any) => (d.turno || "").toLowerCase().trim() === turnoLower) || draws2[0]
        }
      }
      
      let aciertos: any[] = []
      let numerosReales: string[] = []

      if (draw?.numbers && Array.isArray(draw.numbers)) {
        // Extract last 2 digits from each number (draws have 4 digits)
        numerosReales = draw.numbers.map((n: number) => {
          const num = Number(n)
          return String(num % 100).padStart(2, "0")
        })
        
        // Normalize prediction numbers to 2 digits
        const predNumeros = (pred.numeros || []).map((n: string) => String(n).padStart(2, "0"))
        
        // Compare with prediction numbers
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
        resultado: numerosReales.length > 0 ? numerosReales.slice(0, 20) : null,
        aciertos,
        acerto: aciertos.length > 0,
        created_at: pred.created_at
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

    const insertData = {
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