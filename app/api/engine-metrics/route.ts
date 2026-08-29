/**
 * /api/engine-metrics — Engine performance dashboard.
 *
 * GET /api/engine-metrics?turno=Primera
 *
 * Returns V6 engine configs, recent results, and scrape stats.
 * Public read access for transparency.
 */

import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const turno = searchParams.get("turno") || undefined
    const limit = parseInt(searchParams.get("limit") || "20", 10)

    const supabase = getSupabaseAdmin()

    // ── Get V6 engine configs (per-turno weights + backtest scores) ─────
    let configsQuery = supabase
      .from("engine_config" as never)
      .select("*")
      .eq("engine_version" as never, "omega_v6" as never)
      .order("turno" as never)

    if (turno) configsQuery = configsQuery.eq("turno" as never, turno as never)

    const { data: engineConfigs } = await configsQuery

    // ── Get recent prediction results ──────────────────────────
    let resultsQuery = supabase
      .from("prediction_results" as never)
      .select("*")
      .order("prediction_date" as never, { ascending: false } as never)
      .limit(limit)

    if (turno) resultsQuery = resultsQuery.eq("turno" as never, turno as never)

    const { data: results } = await resultsQuery

    // ── Get scrape stats ───────────────────────────────────────
    const { data: scrapeStats } = await supabase
      .from("scrape_runs" as never)
      .select("fecha, total_duration_ms, turnos_succeeded, errors")
      .order("fecha" as never, { ascending: false } as never)
      .limit(30)

    // ── Calculate summary from engine_config ───────────────────
    const configs = (engineConfigs || []) as Array<Record<string, unknown>>
    const summary = {
      total_predictions_evaluated: (results || []).length,
      engines_tracked: ["omega_v6"],
      turnos_tracked: configs.map(c => c.turno),
      best_engine: "omega_v6" as string | null,
      best_hit_rate: configs.length > 0
        ? Math.max(...configs.map(c => Number(c.backtest_score) || 0))
        : 0,
    }

    return NextResponse.json({
      ok: true,
      summary,
      metrics: configs.map(c => ({
        engine_version: "omega_v6",
        turno: c.turno,
        top10_hit_rate: Number(c.backtest_score) || 0,
        total_tests: Number(c.total_tests) || 0,
        calculated_at: c.updated_at || c.created_at,
      })),
      recent_results: results || [],
      weights: configs.map(c => ({
        engine_version: "omega_v6",
        turno: c.turno,
        w_frequency: c.w_frequency,
        w_markov: c.w_markov,
        w_hot: c.w_hot,
        w_cold: c.w_cold,
        w_gap: c.w_gap,
        w_cooccurrence: c.w_cooccurrence,
        w_positional: c.w_positional,
        w_pattern: c.w_pattern,
        w_trend: c.w_trend,
      })),
      engine_configs: engineConfigs || [],
      scrape_stats: scrapeStats || [],
    }, {
      headers: { "Cache-Control": "public, max-age=60" },
    })

  } catch (err) {
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
