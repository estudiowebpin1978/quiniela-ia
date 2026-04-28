import { NextRequest, NextResponse } from "next/server"

function getSK(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
}

function getSB(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  const fecha = req.nextUrl.searchParams.get("fecha")
  const turno = req.nextUrl.searchParams.get("turno")
  
  if (!secret || secret !== "quiniela_ia_cron_2024_seguro") {
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
      return NextResponse.json({ message: "No hay predicciones para comparar", results: [] })
    }

    const fechas = [...new Set(predictions.map((p: any) => p.date))]
    const turnos = [...new Set(predictions.map((p: any) => p.turno))]
    
    const drawsMap: Record<string, number[]> = {}
    for (const f of fechas) {
      for (const t of turnos) {
        const drawRes = await fetch(
          `${SB}/rest/v1/draws?date=eq.${f}&turno=eq.${t}&select=numbers&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        )
        const draws = await drawRes.json()
        if (draws?.[0]?.numbers) {
          drawsMap[`${f}-${t}`] = draws[0].numbers
        }
      }
    }

    for (const pred of predictions) {
      const drawKey = `${pred.date}-${pred.turno}`
      const drawNums = drawsMap[drawKey]
      
      if (!drawNums) continue
      
      const numerosReales = drawNums.map((n: number) => String(n % 100).padStart(2, "0"))
      const predNumeros = (pred.numeros || []).map((n: string) => String(n).padStart(2, "0"))
      
      const aciertos = predNumeros
        .filter((n: string) => numerosReales.includes(n))
        .map((n: string) => ({
          numero: n,
          posicion: numerosReales.indexOf(n) + 1,
          acierto: true
        }))
      
      if (aciertos.length > 0) {
        results.push({
          id: pred.id,
          fecha: pred.date,
          turno: pred.turno,
          prediccion: predNumeros,
          resultado: numerosReales,
          aciertos: aciertos.length,
          detalles: aciertos,
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