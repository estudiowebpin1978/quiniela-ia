/**
 * /api/backtest-omega — Walk-forward backtesting for all engine versions.
 *
 * GET /api/backtest-omega?turno=Primera&start=2025-06-01&end=2026-08-20&compare=true
 *
 * Returns comparison of omega_v5 vs omega_v6 vs baselines.
 * When compare=true, runs head-to-head V5 vs V6.
 * Requires admin auth.
 */

import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  try {
    // ── Auth check ──────────────────────────────────────────────
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    }
    const tier = await resolveUserTier(token)
    if (tier.role !== "admin") {
      return NextResponse.json({ error: "Solo admin" }, { status: 403 })
    }

    // ── Parse params ────────────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const turno = searchParams.get("turno") || "Primera"
    const startDate = searchParams.get("start") || "2025-06-01"
    const endDate = searchParams.get("end") || undefined
    const compareMode = searchParams.get("compare") === "true"

    const validTurnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
    if (!validTurnos.includes(turno)) {
      return NextResponse.json({ error: `Turno inválido. Válidos: ${validTurnos.join(", ")}` }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // ── Head-to-head comparison mode ──────────────────────────
    if (compareMode) {
      try {
        const { data, error } = await supabase.rpc("compare_v5_v6" as never, {
          p_turno: turno,
          p_start_date: startDate,
          p_end_date: endDate || undefined,
        } as never)

        if (error) {
          return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
        }

        return NextResponse.json({
          ok: true,
          mode: "head_to_head",
          turno,
          period: { start: startDate, end: endDate || "current" },
          results: data || [],
          elapsed_ms: Date.now() - t0,
        })
      } catch (e) {
        return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
      }
    }

    // ── Run backtests for each engine ──────────────────────────
    const engines = ["omega_v5", "omega_v6"]
    const results: Array<Record<string, unknown>> = []

    for (const engine of engines) {
      try {
        const rpcName = engine === "omega_v6" ? "backtest_v6" : "backtest_walk_forward"
        const { data, error } = await supabase.rpc(rpcName as never, {
          p_engine_version: engine,
          p_turno: turno,
          p_start_date: startDate,
          p_end_date: endDate || undefined,
        } as never)

        if (error) {
          results.push({ engine_version: engine, error: error.message })
        } else if (data && Array.isArray(data) && data.length > 0) {
          results.push(data[0])
        }
      } catch (e) {
        results.push({ engine_version: engine, error: String(e) })
      }
    }

    // ── Run random baseline ────────────────────────────────────
    try {
      const { data, error } = await supabase.rpc("backtest_random" as never, {
        target_turno: turno,
        start_date: startDate,
        end_date: endDate || undefined,
      } as never)

      if (!error && data && Array.isArray(data) && data.length > 0) {
        results.push({
          engine_version: "random_baseline",
          ...data[0],
          is_baseline: true,
        })
      }
    } catch {}

    // ── Run frequency baseline ─────────────────────────────────
    try {
      const { data, error } = await supabase.rpc("backtest_frequency" as never, {
        target_turno: turno,
        start_date: startDate,
        end_date: endDate || undefined,
      } as never)

      if (!error && data && Array.isArray(data) && data.length > 0) {
        results.push({
          engine_version: "frequency_baseline",
          ...data[0],
          is_baseline: true,
        })
      }
    } catch {}

    // ── Determine winner ───────────────────────────────────────
    const validResults = results.filter(r => !r.error && Number(r.total_tests) > 0)
    const bestEngine = validResults.reduce((best, curr) =>
      (Number(curr.top10_hit_rate) || 0) > (Number(best.top10_hit_rate) || 0) ? curr : best
    , validResults[0])

    // ── Also get scores from engine_config ──────────────────────
    const { data: dbMetrics } = await supabase
      .from("engine_config" as never)
      .select("turno, backtest_score, total_tests, updated_at")
      .eq("engine_version" as never, "omega_v6" as never)
      .eq("turno" as never, turno as never)
      .limit(10)

    const elapsed = Date.now() - t0

    return NextResponse.json({
      ok: true,
      turno,
      period: { start: startDate, end: endDate || "current" },
      engines: results,
      winner: bestEngine?.engine_version || "none",
      best_hit_rate: bestEngine?.top10_hit_rate || 0,
      lift_over_random: bestEngine?.lift_vs_random || 1,
      db_metrics: dbMetrics || [],
      elapsed_ms: elapsed,
    }, {
      headers: {
        "Cache-Control": "private, no-cache",
        "X-Backtest-Elapsed": elapsed.toString(),
      },
    })

  } catch (err) {
    logger.error("[backtest-omega] ERROR:", { error: String(err) })
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    )
  }
}
