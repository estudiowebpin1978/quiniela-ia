import { NextRequest, NextResponse } from "next/server"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export const dynamic = "force-dynamic"

interface DrawRow { date: string; turno: string; numbers: number[] }

export async function GET(req: NextRequest) {
  const SB = getSupabaseUrl()
  const SK = getSupabaseKey()
  if (!SB || !SK) return NextResponse.json({ error: "Config error" }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "Primera"
  const days = Math.min(parseInt(searchParams.get("days") || "90"), 365)

  try {
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString().split("T")[0]

    const res = await fetch(
      `${SB}/rest/v1/draws?turno=eq.${encodeURIComponent(turno)}&date=gte.${sinceStr}&select=date,turno,numbers&order=date.asc&limit=1000`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, signal: AbortSignal.timeout(10000) }
    )
    const draws: DrawRow[] = await res.json()
    if (!Array.isArray(draws) || draws.length < 10) {
      return NextResponse.json({ error: "Insufficient data", total_draws: draws.length })
    }

    const totalDraws = draws.length
    const trainWindow = 60
    let hitAt1 = 0, hitAt5 = 0, hitAt10 = 0
    let totalHitsTop10 = 0, maxHits = 0, validatedDraws = 0

    for (let i = trainWindow; i < totalDraws; i++) {
      const trainSlice = draws.slice(Math.max(0, i - trainWindow), i)
      const targetDraw = draws[i]
      const targetNums = targetDraw.numbers.map(n => String(Number(n) % 100).padStart(2, "0"))

      const freq: Record<string, number> = {}
      for (const d of trainSlice) {
        for (const n of d.numbers) {
          const key = String(Number(n) % 100).padStart(2, "0")
          freq[key] = (freq[key] || 0) + 1
        }
      }

      const predicted = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([n]) => n)

      const hits = predicted.filter(n => targetNums.includes(n))
      validatedDraws++
      totalHitsTop10 += hits.length
      if (hits.length > maxHits) maxHits = hits.length
      if (predicted.includes(targetNums[0])) hitAt1++
      if (hits.length > 0) { hitAt5++; hitAt10++ }
    }

    const v = validatedDraws || 1
    return NextResponse.json({
      total_draws: totalDraws,
      validated_draws: validatedDraws,
      metrics_top_1: {
        hitAt1: Math.round((hitAt1 / v) * 1000) / 10,
        totalDraws: validatedDraws,
      },
      metrics_top_5: {
        hitAt5: Math.round((hitAt5 / v) * 1000) / 10,
        totalDraws: validatedDraws,
      },
      metrics_top_10: {
        hitAt10: Math.round((hitAt10 / v) * 1000) / 10,
        totalDraws: validatedDraws,
        avgHitsPerDraw: Math.round((totalHitsTop10 / v) * 100) / 100,
        maxHits,
        precision: Math.round((totalHitsTop10 / (v * 10)) * 1000) / 10,
        recall: Math.round((totalHitsTop10 / (v * 20)) * 1000) / 10,
      },
    })
  } catch {
    return NextResponse.json({ error: "Backtest failed" }, { status: 500 })
  }
}
