import { NextRequest, NextResponse } from "next/server"
import { getMotorPerformanceStats, ALL_MOTORS } from "@/lib/analisis/motor-performance"
import { getSupabaseUrl, getSupabaseKey, isAdminEmail } from "@/lib/config"

const SB = getSupabaseUrl()
const SK = getSupabaseKey()

async function isAdmin(token: string): Promise<boolean> {
  if (!SB || !SK) return false
  try {
    const r = await fetch(`${SB}/auth/v1/user`, {
      headers: { "apikey": SK, "Authorization": `Bearer ${token}` }
    })
    if (!r.ok) return false
    const user = await r.json()
    return isAdminEmail(user.email)
  } catch { return false }
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "all"
  const days = Number(searchParams.get("days")) || 30

  // In-memory stats from globalThis
  const turnos = turno === "all" ? ["previa", "primera", "matutina", "vespertina", "nocturna"] : [turno]

  const motorStats: Record<string, { motor: string; accuracy: number; timesUsed: number }[]> = {}
  for (const t of turnos) {
    motorStats[t] = await getMotorPerformanceStats(t)
  }

  // Fetch historical draws for accuracy calculation
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)

  let historicalAccuracy: any[] = []
  try {
    const r = await fetch(
      `${SB}/rest/v1/draws?select=date,turno,numbers&date=gte.${cutoff.toISOString().split("T")[0]}&order=date.desc&limit=500`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
    )
    if (r.ok) {
      const draws = await r.json()
      // Group by turno
      const byTurno: Record<string, any[]> = {}
      for (const d of draws) {
        const t = (d.turno || "").toLowerCase()
        if (!byTurno[t]) byTurno[t] = []
        byTurno[t].push(d)
      }
      for (const [t, ds] of Object.entries(byTurno)) {
        historicalAccuracy.push({
          turno: t,
          totalDraws: ds.length,
          dateRange: ds.length > 0 ? `${ds[ds.length - 1].date} → ${ds[0].date}` : "",
          avgNumbers: ds.reduce((s: number, d: any) => s + (d.numbers?.length || 0), 0) / Math.max(ds.length, 1),
        })
      }
    }
  } catch {}

  // Compute engine contribution stats
  const engineContributions: Record<string, number> = {}
  for (const motor of ALL_MOTORS) {
    let totalAccuracy = 0
    let count = 0
    for (const t of turnos) {
      const stats = motorStats[t]?.find(s => s.motor === motor)
      if (stats && stats.timesUsed > 0) {
        totalAccuracy += stats.accuracy
        count++
      }
    }
    engineContributions[motor] = count > 0 ? totalAccuracy / count : 0
  }

  // Rank engines
  const rankedEngines = Object.entries(engineContributions)
    .sort(([, a], [, b]) => b - a)
    .map(([motor, accuracy], i) => ({
      rank: i + 1,
      motor,
      accuracy: Math.round(accuracy * 1000) / 10,
      status: accuracy >= 0.5 ? "excellent" : accuracy >= 0.3 ? "good" : accuracy >= 0.1 ? "fair" : "weak",
    }))

  return NextResponse.json({
    ok: true,
    generatedAt: new Date().toISOString(),
    turnos,
    days,
    motorStats,
    historicalAccuracy,
    rankedEngines,
    summary: {
      totalEngines: ALL_MOTORS.length,
      activeEngines: rankedEngines.filter(e => e.accuracy > 0).length,
      avgAccuracy: rankedEngines.length > 0
        ? Math.round(rankedEngines.reduce((s, e) => s + e.accuracy, 0) / rankedEngines.length * 10) / 10
        : 0,
      topEngine: rankedEngines[0]?.motor || "N/A",
      weakEngines: rankedEngines.filter(e => e.status === "weak").length,
    },
  })
}
