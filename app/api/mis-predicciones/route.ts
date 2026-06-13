import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

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
    if (!Array.isArray(predictions)) return NextResponse.json({ predictions: [] })
    if (predictions.length === 0) return NextResponse.json({ predictions: [] })

    // === BATCH: fetch all draws for needed dates in ONE query ===
    const turnoDates = predictions.map((p: any) => {
      const t = (p.turno || "").replace(/-\d+cifras?$/i, "").toLowerCase().trim()
      const d = (p.date || "").trim()
      const tn = t.charAt(0).toUpperCase() + t.slice(1)
      return { date: d, turno: t, turnoNormalized: tn, pred: p }
    }).filter((td: any) => td.date && td.turno && !isDiaSinSorteo(td.date))

    // Build OR filter: (date=eq.X AND turno=eq.Y) OR ...
    const orFilters = turnoDates
      .filter((td: any) => td.date && td.turnoNormalized)
      .map((td: any) => `and(date.eq.${td.date},turno.eq.${td.turnoNormalized})`)
    
    let drawsMap: Record<string, any> = {}
    if (orFilters.length > 0) {
      // Supabase OR filter limit: batch in groups of 20
      const batchSize = 20
      for (let i = 0; i < orFilters.length; i += batchSize) {
        const batch = orFilters.slice(i, i + batchSize)
        const orStr = batch.join(",")
        try {
          const drawsRes = await fetch(
            `${SB()}/rest/v1/draws?or=(${orStr})&select=numbers,turno,date&limit=100`,
            { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
          )
          if (drawsRes.ok) {
            const draws = await drawsRes.json()
            if (Array.isArray(draws)) {
              for (const d of draws) {
                const key = `${d.date}|${(d.turno || "").toLowerCase()}`
                if (d.numbers && Array.isArray(d.numbers) && d.numbers.length >= 5) {
                  drawsMap[key] = d
                }
              }
            }
          }
        } catch {}
      }
    }

    // === Process predictions using drawsMap ===
    const results = []
    for (const pred of predictions) {
      const rawTurno = pred.turno || ""
      const turnoLower = rawTurno.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
      const predDate = (pred.date || "").trim()
      const drawKey = `${predDate}|${turnoLower}`
      const draw = drawsMap[drawKey] || null
      const disponible = !!draw

      let aciertos: any[] = []
      let aciertos3: any[] = []
      let aciertos4: any[] = []
      let numerosReales: string[] = []
      let numerosReales3: string[] = []
      let numerosReales4: string[] = []

      let numerosData: any = pred.numeros
      if (Array.isArray(numerosData) && numerosData.length === 1 && typeof numerosData[0] === "string") {
        try { numerosData = JSON.parse(numerosData[0]) } catch {}
      }
      const pred2: string[] = Array.isArray(numerosData) ? numerosData : (numerosData?.["2"] || [])
      let pred3: string[] = []
      let pred4: string[] = []
      if (!Array.isArray(numerosData)) {
        pred3 = numerosData?.["3"] || []
        pred4 = numerosData?.["4"] || []
      }

      if (draw?.numbers && Array.isArray(draw.numbers)) {
        numerosReales = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
        numerosReales3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
        numerosReales4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

        const predNumeros2 = pred2.map((n: string) => String(n).padStart(2, "0"))
        aciertos = predNumeros2.filter((n: string) => numerosReales.includes(n)).map((n: string) => ({
          numero: n, puesto: numerosReales.indexOf(n) + 1, tipo: 2
        }))

        if (pred3.length > 0) {
          const predNumeros3 = pred3.map((n: string) => String(n).padStart(3, "0"))
          aciertos3 = predNumeros3.filter((n: string) => numerosReales3.includes(n)).map((n: string) => ({
            numero: n, puesto: numerosReales3.indexOf(n) + 1, tipo: 3
          }))
        }

        if (pred4.length > 0) {
          const predNumeros4 = pred4.map((n: string) => String(n).padStart(4, "0"))
          aciertos4 = predNumeros4.filter((n: string) => numerosReales4.includes(n)).map((n: string) => ({
            numero: n, puesto: numerosReales4.indexOf(n) + 1, tipo: 4
          }))
        }
      }

      const allAciertos = [...aciertos, ...aciertos3, ...aciertos4]

      results.push({
        id: pred.id, fecha: pred.date, turno: pred.turno,
        numeros: pred2,
        numeros_3: pred3,
        numeros_4: pred4,
        resultado: disponible && numerosReales.length > 0 ? numerosReales.slice(0, 10) : null,
        resultado_3: disponible && numerosReales3.length > 0 ? numerosReales3.slice(0, 10) : null,
        resultado_4: disponible && numerosReales4.length > 0 ? numerosReales4.slice(0, 10) : null,
        aciertos: disponible ? allAciertos : [],
        aciertos_2: disponible ? aciertos : [],
        aciertos_3: disponible ? aciertos3 : [],
        aciertos_4: disponible ? aciertos4 : [],
        acerto: disponible ? allAciertos.length > 0 : false,
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
    const hasNumeros = Array.isArray(numeros) ? numeros.length > 0 : numeros && typeof numeros === "object" && Object.keys(numeros).length > 0
    if (!date || !turno || !hasNumeros) {
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

    // Store: array for free users, JSON string in array for premium (object)
    const numerosToStore = Array.isArray(numeros) ? numeros : [JSON.stringify(numeros)]

    const insertData: any = {
      user_id: userId,
      date: date,
      turno: turno,
      numeros: numerosToStore,
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
