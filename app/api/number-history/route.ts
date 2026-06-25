/**
 * API: Historical data for a specific number
 * GET /api/number-history?number=42&turno=nocturna
 * Returns frequency, gaps, recent appearances, and trend data.
 */
import { NextRequest, NextResponse } from "next/server"

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || ""
const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!SB || !SK) {
    return NextResponse.json({ error: "Config" }, { status: 500 })
  }

  const numStr = req.nextUrl.searchParams.get("number")
  const turno = req.nextUrl.searchParams.get("turno")
  
  if (!numStr) {
    return NextResponse.json({ error: "number required" }, { status: 400 })
  }

  const targetNum = parseInt(numStr)
  if (isNaN(targetNum) || targetNum < 0 || targetNum > 99) {
    return NextResponse.json({ error: "number must be 0-99" }, { status: 400 })
  }

  try {
    // Fetch last 500 draws
    let url = `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=500`
    if (turno) url += `&turno=eq.${turno}`

    const res = await fetch(url, {
      headers: { apikey: SK, Authorization: `Bearer ${SK}` },
    })
    const draws = await res.json()

    if (!draws?.length) {
      return NextResponse.json({ error: "No data" }, { status: 404 })
    }

    // Analyze appearances
    const appearances: { date: string; turno: string; position: number }[] = []
    const turnoFreq: Record<string, number> = {}
    const lastSeen: Record<string, string> = {}
    const monthlyFreq: Record<string, number> = {}

    for (const draw of draws) {
      const nums = (draw.numbers || []).map((n: number) => n % 100)
      const idx = nums.indexOf(targetNum)
      if (idx !== -1) {
        appearances.push({
          date: draw.date,
          turno: draw.turno,
          position: idx + 1,
        })
        turnoFreq[draw.turno] = (turnoFreq[draw.turno] || 0) + 1
        if (!lastSeen[draw.turno]) lastSeen[draw.turno] = draw.date
        
        const month = draw.date.substring(0, 7) // YYYY-MM
        monthlyFreq[month] = (monthlyFreq[month] || 0) + 1
      }
    }

    // Calculate gaps (draws since last appearance per turno)
    const gaps: Record<string, number> = {}
    const turnos = ["Nocturna", "Matutina", "Vespertina", "Primera", "Previa"]
    for (const t of turnos) {
      const tDraws = draws.filter((d: any) => d.turno === t)
      let gap = 0
      for (const d of tDraws) {
        const nums = (d.numbers || []).map((n: number) => n % 100)
        if (nums.includes(targetNum)) break
        gap++
      }
      gaps[t] = gap
    }

    // Overall stats
    const totalDraws = draws.length
    const totalAppearances = appearances.length
    const frequency = totalDraws > 0 ? (totalAppearances / totalDraws * 100) : 0
    const expectedFreq = 20 / 100 * 100 // 20 numbers out of 100 per draw

    // Position distribution
    const posDist: Record<number, number> = {}
    for (const a of appearances) {
      posDist[a.position] = (posDist[a.position] || 0) + 1
    }

    // Recent trend (last 30 vs previous 30)
    const recent30 = draws.slice(0, 30)
    const prev30 = draws.slice(30, 60)
    const recentHits = recent30.filter((d: any) => {
      const nums = (d.numbers || []).map((n: number) => n % 100)
      return nums.includes(targetNum)
    }).length
    const prevHits = prev30.filter((d: any) => {
      const nums = (d.numbers || []).map((n: number) => n % 100)
      return nums.includes(targetNum)
    }).length

    const trend = recentHits > prevHits ? "hot" : recentHits < prevHits ? "cold" : "stable"

    return NextResponse.json({
      number: targetNum,
      stats: {
        totalDraws,
        totalAppearances,
        frequency: +frequency.toFixed(1),
        expectedFrequency: expectedFreq,
        vsExpected: +(frequency - expectedFreq).toFixed(1),
      },
      appearances: appearances.slice(0, 50), // last 50 appearances
      turnoFreq,
      gaps,
      lastSeen,
      monthlyFreq,
      posDist,
      trend: {
        direction: trend,
        recent30Hits: recentHits,
        prev30Hits: prevHits,
        change: recentHits - prevHits,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
