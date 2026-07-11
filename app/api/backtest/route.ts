/**
 * Backtesting API endpoint
 * 
 * GET /api/backtest?turno=nocturna&days=90
 * 
 * Runs walk-forward validation on historical draws using the 30-factor engine.
 * Returns Hit@1/5/10, Precision, Recall, ROI metrics.
 */

import { NextRequest, NextResponse } from "next/server"
import { walkForwardBacktest } from "@/lib/analisis/backtest"
import { calcularFactores30, DEFAULT_WEIGHTS } from "@/lib/analisis/factores30"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("sorteo") || searchParams.get("turno") || "nocturna"
  const daysParam = parseInt(searchParams.get("days") || "90")

  const SB = getSupabaseUrl()
  const SK = getSupabaseKey()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  const turnosValidos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  if (!turnosValidos.includes(turno.toLowerCase())) {
    return NextResponse.json({ error: `Sorteo inválido. Válidos: ${turnosValidos.join(", ")}` }, { status: 400 })
  }

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 20000)

  try {
    const url = `${SB}/rest/v1/draws?select=date,turno,numbers&turno=ilike.*${turno.toLowerCase()}*&order=date.desc&limit=5000`
    const res = await fetch(url, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      signal: ctrl.signal
    })
    clearTimeout(to)

    if (!res.ok) return NextResponse.json({ error: `Error Supabase: ${res.status}` }, { status: 500 })

    const rows = await res.json()
    if (!rows?.length) return NextResponse.json({ error: `Sin datos para turno ${turno}` }, { status: 404 })

    // Extract valid sequences
    const sequences: number[][] = []
    const dates: string[] = []
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 20) {
        const nums4 = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        if (nums4.length >= 20) {
          sequences.push(nums4)
          dates.push(row.date)
        }
      }
    }

    sequences.reverse()
    dates.reverse()

    if (sequences.length < 60) {
      return NextResponse.json({ error: `Datos insuficientes: ${sequences.length} sorteos (mínimo 60)` }, { status: 400 })
    }

    // Run backtest with 30-factor engine
    const minTraining = Math.min(60, Math.floor(sequences.length * 0.3))
    const metrics = walkForwardBacktest(sequences, {
      turno,
      minTrainingDraws: minTraining,
      topN: 10,
      walkForwardStep: 1,
    })

    // Also run with different topN for comparison
    const metrics5 = walkForwardBacktest(sequences, {
      turno,
      minTrainingDraws: minTraining,
      topN: 5,
      walkForwardStep: 1,
    })

    const metrics1 = walkForwardBacktest(sequences, {
      turno,
      minTrainingDraws: minTraining,
      topN: 1,
      walkForwardStep: 1,
    })

    return NextResponse.json({
      turno,
      total_draws: sequences.length,
      training_window: minTraining,
      metrics_top_10: metrics,
      metrics_top_5: metrics5,
      metrics_top_1: metrics1,
      data_range: {
        first: dates[0],
        last: dates[dates.length - 1]
      }
    })
  } catch (err: any) {
    clearTimeout(to)
    return NextResponse.json({ error: err.message || "Error interno" }, { status: 500 })
  }
}
