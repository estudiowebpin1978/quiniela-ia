import { NextRequest, NextResponse } from "next/server"

type Row = { numbers?: unknown[]; date?: string; turno?: string }

function pad(n: number, l = 2) {
  return String(n).padStart(l, "0")
}

// Función simplificada para generar predicciones (basada en el motor principal)
async function generatePredictionForDate(sb: string, sk: string, turno: string, targetDate: string) {
  try {
    // Obtener datos históricos hasta la fecha objetivo
    const r = await fetch(`${sb}/rest/v1/sorteos?turno=eq.${turno}&date=lte.${targetDate}&order=date.desc&limit=500`, {
      headers: { "apikey": sk, "Authorization": `Bearer ${sk}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!r.ok) return null
    const rows: Row[] = await r.json()

    if (rows.length < 50) return null // Necesitamos datos suficientes

    // Calcular frecuencias
    const freq = new Array(100).fill(0)
    for (const row of rows) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      for (const n of nums) {
        const num = Number(n) % 100
        if (num >= 0 && num <= 99) freq[num]++
      }
    }

    // Calcular atrasos
    const lastSeen = new Array(100).fill(0)
    for (let i = 0; i < rows.length; i++) {
      const nums = Array.isArray(rows[i]?.numbers) ? rows[i].numbers! : []
      for (const n of nums) {
        const num = Number(n) % 100
        if (num >= 0 && num <= 99) lastSeen[num] = i
      }
    }
    const atraso = lastSeen.map((ls) => rows.length - ls)

    // Calcular tendencias (últimos 200 sorteos)
    const trend = new Array(100).fill(0)
    const recent = rows.slice(0, 200)
    for (const row of recent) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      for (const n of nums) {
        const num = Number(n) % 100
        if (num >= 0 && num <= 99) trend[num]++
      }
    }

    // Monte Carlo simplificado
    const mc = new Array(100).fill(0)
    const samples = 10000
    const w = freq.map((f) => f + 1)
    const tot = w.reduce((a, b) => a + b, 0)
    for (let s = 0; s < samples; s++) {
      const r = Math.random() * tot
      let acc = 0
      for (let i = 0; i < w.length; i++) {
        acc += w[i]
        if (acc >= r) {
          mc[i]++
          break
        }
      }
    }

    // Día de la semana
    const targetDay = new Date(targetDate + "T00:00:00").toLocaleDateString("es-AR", { weekday: "long" })
    const dayBias = new Array(100).fill(0)
    let dayTotal = 0
    for (const row of rows) {
      if (!row?.date) continue
      const date = new Date(row.date + "T00:00:00")
      if (date.toLocaleDateString("es-AR", { weekday: "long" }) !== targetDay) continue
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      for (const n of nums) {
        const num = Number(n) % 100
        if (num >= 0 && num <= 99) {
          dayBias[num]++
          dayTotal++
        }
      }
    }
    if (dayTotal > 0) {
      for (let i = 0; i < dayBias.length; i++) {
        dayBias[i] = dayBias[i] / dayTotal
      }
    }

    // Patrones numéricos
    const patterns = new Array(100).fill(0)
    for (let i = 0; i < 100; i++) {
      const par = i % 2 === 0 ? 1 : 0
      const bajo = i < 50 ? 1 : 0
      patterns[i] = par * 0.5 + bajo * 0.5
    }

    // Calcular scores finales con pesos
    const scores = []
    for (let i = 0; i < 100; i++) {
      const score =
        (freq[i] / Math.max(...freq) * 0.22) +           // Frecuencia: 22%
        (1 / (1 + atraso[i]) * 0.18) +                   // Atraso: 18%
        (trend[i] / Math.max(...trend) * 0.16) +         // Tendencia: 16%
        (mc[i] / Math.max(...mc) * 0.10) +               // Monte Carlo: 10%
        (i === 0 ? 0.05 : 0) +                           // Primera posición: 8% (simplificado)
        (dayBias[i] * 0.13) +                            // Día semana: 13%
        (patterns[i] * 0.13)                             // Patrones: 13%

      scores.push({ numero: i, score })
    }

    scores.sort((a, b) => b.score - a.score)
    return scores.slice(0, 10).map(s => s.numero) // Top 10 predicciones
  } catch (e) {
    console.error("Error generando predicción para backtest:", e)
    return null
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const days = parseInt(searchParams.get("days") || "30")
    const turno = searchParams.get("turno") || "Nocturna"

    if (days < 1 || days > 365) {
      return NextResponse.json({ error: "days debe estar entre 1 y 365" }, { status: 400 })
    }

    const sb = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sk = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sb || !sk) {
      return NextResponse.json({ error: "Configuración de base de datos incompleta" }, { status: 500 })
    }

    // Obtener fechas de sorteos reales en el período
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(endDate.getDate() - days)

    const startStr = startDate.toISOString().split("T")[0]
    const endStr = endDate.toISOString().split("T")[0]

    const r = await fetch(`${sb}/rest/v1/sorteos?turno=eq.${turno}&date=gte.${startStr}&date=lte.${endStr}&order=date.asc`, {
      headers: { "apikey": sk, "Authorization": `Bearer ${sk}` },
      signal: AbortSignal.timeout(10000)
    })

    if (!r.ok) {
      return NextResponse.json({ error: "Error obteniendo datos históricos" }, { status: 500 })
    }

    const sorteos: Row[] = await r.json()

    if (sorteos.length === 0) {
      return NextResponse.json({ error: "No hay datos suficientes para el período solicitado" }, { status: 404 })
    }

    let totalPredicciones = 0
    let totalAciertos = 0
    let totalAciertosPosicion1 = 0
    const resultados: any[] = []

    for (const sorteo of sorteos) {
      if (!sorteo.date || !Array.isArray(sorteo.numbers)) continue

      // Generar predicción para la fecha anterior al sorteo
      const predDate = new Date(sorteo.date)
      predDate.setDate(predDate.getDate() - 1)
      const predDateStr = predDate.toISOString().split("T")[0]

      const prediccion = await generatePredictionForDate(sb, sk, turno, predDateStr)
      if (!prediccion) continue

      // Obtener números reales
      const reales = sorteo.numbers.map(n => Number(n) % 100).filter(n => n >= 0 && n <= 99)

      // Calcular aciertos
      const aciertos = prediccion.filter(p => reales.includes(p))
      const aciertoPos1 = reales.includes(prediccion[0]) ? 1 : 0

      totalPredicciones++
      totalAciertos += aciertos.length
      totalAciertosPosicion1 += aciertoPos1

      resultados.push({
        fecha: sorteo.date,
        turno,
        prediccion: prediccion.map(pad),
        reales: reales.map(pad),
        aciertos: aciertos.map(pad),
        aciertoPos1,
        precision: aciertos.length / prediccion.length
      })
    }

    const precisionGeneral = totalPredicciones > 0 ? totalAciertos / (totalPredicciones * 10) : 0
    const precisionPos1 = totalPredicciones > 0 ? totalAciertosPosicion1 / totalPredicciones : 0

    return NextResponse.json({
      periodo: `${startStr} a ${endStr}`,
      turno,
      totalSorteosAnalizados: totalPredicciones,
      precisionGeneral: Math.round(precisionGeneral * 10000) / 100, // %
      precisionPosicion1: Math.round(precisionPos1 * 10000) / 100, // %
      totalAciertos,
      totalAciertosPos1: totalAciertosPosicion1,
      resultados: resultados.slice(-10), // Últimos 10 para no sobrecargar
      mensaje: `Análisis completado. Precisión general: ${(precisionGeneral * 100).toFixed(2)}%`
    })

  } catch (e: any) {
    console.error("Error en backtest:", e)
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}