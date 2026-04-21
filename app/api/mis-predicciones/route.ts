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
      `${SB}/rest/v1/predicciones?user_id=eq.${userId}&select=id,fecha,turno,numeros_2,created_at,estado&order=created_at.desc&limit=30`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
    )
    const predictions = await predRes.json()
    if (!Array.isArray(predictions)) return NextResponse.json({ predictions: [] })

    const results = []
    for (const pred of predictions) {
      const drawRes = await fetch(
        `${SB}/rest/v1/quiniela_nacional?fecha=eq.${pred.fecha}&turno=eq.${pred.turno?.toLowerCase()}&select=resultados&limit=1`,
        { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
      )
      const draws = await drawRes.json()
      const draw = draws?.[0]
      let aciertos: any[] = []
      let numerosReales: string[] = []

      if (draw?.resultados && Array.isArray(draw.resultados)) {
        numerosReales = draw.resultados.map((r: any) =>
          String(Number(r.numero) % 100).padStart(2, "0")
        )
        aciertos = pred.numeros_2?.filter((n: string) => numerosReales.includes(n)).map((n: string) => ({
          numero: n,
          puesto: numerosReales.indexOf(n) + 1
        })) || []
      }

      results.push({
        id: pred.id,
        fecha: pred.fecha,
        turno: pred.turno,
        numeros: pred.numeros_2,
        resultado: numerosReales.slice(0, 20) || null,
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

    const r = await fetch(`${SB}/rest/v1/predicciones`, {
      method: "POST",
      headers: {
        "apikey": SK,
        "Authorization": `Bearer ${SK}`,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({
        fecha: date,
        turno: turno,
        numeros_2: numeros,
        estado: "pendiente",
        user_id: userId
      })
    })

    if (!r.ok) return NextResponse.json({ error: "Error guardando" }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}