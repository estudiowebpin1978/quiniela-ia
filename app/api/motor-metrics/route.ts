import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { validateJwt } from "@/lib/auth/jwt"
import { isAdminEmail } from "@/lib/config"

async function isAdmin(token: string): Promise<boolean> {
  const decoded = await validateJwt(token)
  if (!decoded) return false
  return isAdminEmail(decoded.email)
}

export const maxDuration = 30

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "all"
  const days = Number(searchParams.get("days")) || 30

  const supabase = getSupabaseAdmin()

  try {
    // ── Get V6 engine configs (per-turno optimized weights) ─────
    const { data: configs } = await supabase
      .from("engine_config" as never)
      .select("*")
      .eq("engine_version" as never, "omega_v6" as never)
      .order("turno" as never)

    // ── Get recent engine predictions ──────────────────────────
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffDate = cutoff.toISOString().split("T")[0]

    const { data: predictions } = await supabase
      .from("engine_predictions" as never)
      .select("turno, prediction_date, confidence, generated_at")
      .eq("engine_version" as never, "omega_v6" as never)
      .gte("prediction_date" as never, cutoffDate as never)
      .order("prediction_date" as never, { ascending: false } as never)

    // ── Get prediction results (hits) ──────────────────────────
    const { data: results } = await supabase
      .from("prediction_results" as never)
      .select("turno, prediction_date, hits_top10, hits_top5, hits_top1, hit_rate")
      .eq("engine_version" as never, "omega_v6" as never)
      .gte("prediction_date" as never, cutoffDate as never)
      .order("prediction_date" as never, { ascending: false } as never)

    // ── Build per-turno stats ──────────────────────────────────
    const turnos = turno === "all"
      ? ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
      : [turno.charAt(0).toUpperCase() + turno.slice(1)]

    const motorStats = turnos.map(t => {
      const cfg = (configs as Array<Record<string, unknown>> || []).find(c => c.turno === t)
      const preds = (predictions as Array<Record<string, unknown>> || []).filter(p => p.turno === t)
      const res = (results as Array<Record<string, unknown>> || []).filter(r => r.turno === t)

      const avgConfidence = preds.length > 0
        ? preds.reduce((sum, p) => sum + (Number(p.confidence) || 0), 0) / preds.length
        : 0

      const avgHitRate = res.length > 0
        ? res.reduce((sum, r) => sum + (Number(r.hit_rate) || 0), 0) / res.length
        : 0

      return {
        turno: t,
        motor: "omega_v6",
        accuracy: Math.round(avgHitRate * 1000) / 10,
        confidence: Math.round(avgConfidence * 10) / 10,
        predictionsCount: preds.length,
        resultsCount: res.length,
        backtestScore: cfg ? Number(cfg.backtest_score) || 0 : 0,
        totalTests: cfg ? Number(cfg.total_tests) || 0 : 0,
        weights: cfg ? {
          frequency: Number(cfg.w_frequency),
          markov: Number(cfg.w_markov),
          hot: Number(cfg.w_hot),
          cold: Number(cfg.w_cold),
          gap: Number(cfg.w_gap),
          cooccurrence: Number(cfg.w_cooccurrence),
          positional: Number(cfg.w_positional),
          pattern: Number(cfg.w_pattern),
          trend: Number(cfg.w_trend),
        } : null,
      }
    })

    // ── Summary ────────────────────────────────────────────────
    const totalBacktests = motorStats.reduce((sum, m) => sum + m.totalTests, 0)
    const avgHitRate = motorStats.length > 0
      ? motorStats.reduce((sum, m) => sum + m.backtestScore, 0) / motorStats.length
      : 0

    const bestTurno = motorStats.reduce((best, m) =>
      m.backtestScore > best.backtestScore ? m : best
    , motorStats[0])

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      engine: "omega_v6",
      turnos,
      days,
      motorStats,
      summary: {
        totalEngines: 1,
        activeEngines: 1,
        avgAccuracy: Math.round(avgHitRate * 10) / 10,
        topEngine: "omega_v6",
        topTurno: bestTurno?.turno || "N/A",
        topScore: bestTurno?.backtestScore || 0,
        totalBacktests,
        weakEngines: 0,
      },
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    })

  } catch (err) {
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    )
  }
}
