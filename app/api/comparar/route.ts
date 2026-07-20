import { NextRequest, NextResponse } from "next/server"

function getSK(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
}

function getSB(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
}

function normalizeTurno(t: string): string {
  return t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
}

function parseNumeros(predNumeros: any): { n2: string[]; n3: string[]; n4: string[] } {
  let data = predNumeros
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    try { data = JSON.parse(data[0]) } catch {}
  }
  if (Array.isArray(data)) {
    return { n2: data.map((n: string) => String(n).padStart(2, "0")), n3: [], n4: [] }
  }
  return {
    n2: (data?.["2"] || []).map((n: string) => String(n).padStart(2, "0")),
    n3: (data?.["3"] || []).map((n: string) => String(n).padStart(3, "0")),
    n4: (data?.["4"] || []).map((n: string) => String(n).padStart(4, "0")),
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  const fecha = req.nextUrl.searchParams.get("fecha")
  const turno = req.nextUrl.searchParams.get("turno")
  
  const cronSecret = process.env.CRON_SECRET || ""
  if (!cronSecret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 })
  }
  if (secret !== cronSecret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const SB = getSB()
  const SK = getSK()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 })
  }

  try {
    const results: any[] = []
    
    let url = `${SB}/rest/v1/user_predictions?select=id,user_id,date,turno,numeros,created_at&order=date.desc,turno&limit=100`
    if (fecha) url += `&date=eq.${fecha}`
    
    const predRes = await fetch(url, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }
    })
    const predictions = await predRes.json()
    
    if (!predictions?.length) {
      return NextResponse.json({ message: "No hay análisis para comparar", results: [] })
    }

    const fechas = [...new Set(predictions.map((p: any) => p.date))] as string[]
    const turnos = [...new Set(predictions.map((p: any) => normalizeTurno(p.turno || "")))] as string[]
    
    const drawsMap: Record<string, number[]> = {}
    for (const f of fechas) {
      for (const t of turnos) {
        const normalizedTurno = t.charAt(0).toUpperCase() + t.slice(1)
        const drawRes = await fetch(
          `${SB}/rest/v1/draws?date=eq.${f}&turno=eq.${normalizedTurno}&select=numbers&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        )
        const draws = await drawRes.json()
        if (draws?.[0]?.numbers) {
          drawsMap[`${f}-${t}`] = draws[0].numbers
        }
      }
    }

    for (const pred of predictions) {
      const turnoLower = normalizeTurno(pred.turno || "")
      const drawKey = `${pred.date}-${turnoLower}`
      const drawNums = drawsMap[drawKey]
      
      if (!drawNums) continue
      
      const nums2 = drawNums.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
      const nums3 = drawNums.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
      const nums4 = drawNums.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

      const { n2: predNumeros2, n3: predNumeros3, n4: predNumeros4 } = parseNumeros(pred.numeros)
      
      const aciertos2 = predNumeros2
        .filter((n: string) => nums2.includes(n))
        .map((n: string) => ({ numero: n, posicion: nums2.indexOf(n) + 1, tipo: 2 }))

      const aciertos3 = predNumeros3
        .filter((n: string) => nums3.includes(n))
        .map((n: string) => ({ numero: n, posicion: nums3.indexOf(n) + 1, tipo: 3 }))

      const aciertos4 = predNumeros4
        .filter((n: string) => nums4.includes(n))
        .map((n: string) => ({ numero: n, posicion: nums4.indexOf(n) + 1, tipo: 4 }))

      const allAciertos = [...aciertos2, ...aciertos3, ...aciertos4]
      
      if (allAciertos.length > 0) {
        results.push({
          id: pred.id,
          fecha: pred.date,
          turno: pred.turno,
          prediccion_2: predNumeros2,
          prediccion_3: predNumeros3,
          prediccion_4: predNumeros4,
          resultado_2: nums2,
          resultado_3: nums3,
          resultado_4: nums4,
          aciertos: allAciertos.length,
          aciertos_2: aciertos2.length,
          aciertos_3: aciertos3.length,
          aciertos_4: aciertos4.length,
          detalles: allAciertos,
          acierto: true
        })
      }
    }

    const summary = {
      totalPredicciones: predictions.length,
      conAciertos: results.length,
      sinAciertos: predictions.length - results.length,
      porcentajeAcierto: predictions.length > 0 ? Math.round((results.length / predictions.length) * 100) : 0
    }

    return NextResponse.json({
      ok: true,
      summary,
      results: results.slice(0, 50)
    })

  } catch (e: unknown) {
    const error = e as Error
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}