import { NextRequest, NextResponse } from "next/server"
import { scoreDigits, buildNeuralNetwork, monteCarloSim, getTransiciones, markovPrediction } from "../predictions/route"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkomfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const turno = req.nextUrl.searchParams.get("turno") || "nocturna"
  const diasAtras = parseInt(req.nextUrl.searchParams.get("dias") || "30")
  
  try {
    // Cargar datos históricos
    const since = new Date(Date.now() - (diasAtras + 10) * 86400000).toISOString().split("T")[0]
    const url = `${SB()}/rest/v1/draws?select=date,turno,numbers&turno=eq.${turno}&date=gte.${since}&order=date.asc&limit=5000`
    
    const res = await fetch(url, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }
    })
    
    if (!res.ok) {
      return NextResponse.json({ error: `Error cargando datos: ${res.status}` }, { status: 500 })
    }
    
    const rows = await res.json()
    
    if (!Array.isArray(rows) || rows.length < 10) {
      return NextResponse.json({ error: "Datos insuficientes para backtesting" }, { status: 400 })
    }
    
    // Preparar secuencias
    const sequences: number[][] = []
    const dates: string[] = []
    
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 20) {
        const nums = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        if (nums.length >= 20) {
          sequences.push(nums)
          dates.push(row.date)
        }
      }
    }
    
    if (sequences.length < 10) {
      return NextResponse.json({ error: "Secuencias insuficientes" }, { status: 400 })
    }
    
    // Ejecutar backtesting
    const resultados: any[] = []
    let aciertosTop10 = 0
    let aciertosTop20 = 0
    let aciertosMarkov = 0
    let aciertosNN = 0
    let totalPredicciones = 0
    
    // Usar una ventana deslizante para hacer predicciones
    const ventanaEntrenamiento = 50 // Usar 50 sorteos previos para predecir
    
    for (let i = ventanaEntrenamiento; i < sequences.length - 1; i++) {
      const secuenciasTrain = sequences.slice(0, i)
      const secuenciaReal = sequences[i]
      const fecha = dates[i]
      
      // Obtener predicciones
      const { topNN } = buildNeuralNetwork(secuenciasTrain)
      const markovTop = markovPrediction(secuenciasTrain, 10)
      
      // Verificar aciertos en el top 10 (cualquier posición de los 20 números)
      const top10N = topNN.slice(0, 10).map((x: any) => x.n)
      const aciertos10 = secuenciaReal.filter((n: number) => top10N.includes(n % 100)).length
      
      // Verificar aciertos en el top 20
      const top20N = topNN.slice(0, 20).map((x: any) => x.n)
      const aciertos20 = secuenciaReal.filter((n: number) => top20N.includes(n % 100)).length
      
      // Verificar Markov
      const markovN = markovTop.map((m: any) => m.n)
      const aciertosMarkov10 = secuenciaReal.filter((n: number) => markovN.includes(n % 100)).length
      
      // Verificar Neural Network top 10
      const nnN = topNN.slice(0, 10).map((x: any) => x.n)
      const aciertosNN10 = secuenciaReal.filter((n: number) => nnN.includes(n % 100)).length
      
      resultados.push({
        fecha,
        aciertosTop10: aciertos10,
        aciertosTop20: aciertos20,
        aciertosMarkov: aciertosMarkov10,
        aciertosNN: aciertosNN10,
        totalReal: secuenciaReal.length
      })
      
      aciertosTop10 += aciertos10
      aciertosTop20 += aciertos20
      aciertosMarkov += aciertosMarkov10
      aciertosNN += aciertosNN10
      totalPredicciones++
    }
    
    const promedioTop10 = totalPredicciones > 0 ? (aciertosTop10 / totalPredicciones).toFixed(2) : "0"
    const promedioTop20 = totalPredicciones > 0 ? (aciertosTop20 / totalPredicciones).toFixed(2) : "0"
    const promedioMarkov = totalPredicciones > 0 ? (aciertosMarkov / totalPredicciones).toFixed(2) : "0"
    const promedioNN = totalPredicciones > 0 ? (aciertosNN / totalPredicciones).toFixed(2) : "0"
    
    return NextResponse.json({
      ok: true,
      configuracion: {
        turno,
        diasAtras,
        ventanaEntrenamiento,
        totalSorteosAnalizados: totalPredicciones
      },
      resultados,
      resumen: {
        aciertosTop10,
        aciertosTop20,
        aciertosMarkov,
        aciertosNN,
        totalPredicciones,
        promedioAciertosTop10: promedioTop10,
        promedioAciertosTop20: promedioTop20,
        promedioAciertosMarkov: promedioMarkov,
        promedioAciertosNN: promedioNN,
        eficienciaTop10: totalPredicciones > 0 ? ((aciertosTop10 / (totalPredicciones * 20)) * 100).toFixed(2) + "%" : "0%",
        eficienciaMarkov: totalPredicciones > 0 ? ((aciertosMarkov / (totalPredicciones * 20)) * 100).toFixed(2) + "%" : "0%",
      },
      mensaje: `Backtesting completado: ${totalPredicciones} predicciones evaluadas`
    })
    
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error en backtesting" }, { status: 500 })
  }
}
