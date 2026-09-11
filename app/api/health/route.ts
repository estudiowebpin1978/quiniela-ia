/**
 * /api/health — Public health check endpoint.
 * Returns 200 always (degraded is not an error).
 * Used by cron-job.org as a Dead Man's Switch.
 *
 * Checks:
 * 1. Supabase connectivity
 * 2. Scraper freshness (last draw < 2h old)
 * 3. Engine performance data availability
 * 4. Predictions cache freshness
 */

import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const runtime = "nodejs"
export const maxDuration = 15

interface HealthCheck {
  ok: boolean
  detail?: string
}

export async function GET() {
  const checks: Record<string, HealthCheck> = {}

  // 1. Supabase connection
  try {
    const supabase = getSupabaseAdmin()
    const { error } = await supabase
      .from("draws")
      .select("id")
      .limit(1)
    checks.database = { ok: !error, detail: error?.message }
  } catch (e) {
    checks.database = { ok: false, detail: String(e) }
  }

  // 2. Scraper freshness (Dead Man's Switch)
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from("draws")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (data?.created_at) {
      const lastScrape = new Date(data.created_at)
      const diffMinutes = (Date.now() - lastScrape.getTime()) / 60000
      checks.scraper = {
        ok: diffMinutes < 120,
        detail: `Last scrape: ${Math.round(diffMinutes)}min ago`,
      }
    } else {
      checks.scraper = { ok: false, detail: "No draws found in DB" }
    }
  } catch (e) {
    checks.scraper = { ok: false, detail: String(e) }
  }

  // 3. Engine performance — check if backtest data exists
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("engine_performance")
      .select("turno, engine_name, hit_count, total_runs, win_rate_last_10")
      .limit(5)

    if (error) {
      checks.engine_performance = { ok: false, detail: error.message }
    } else if (!data || data.length === 0) {
      checks.engine_performance = { ok: false, detail: "No engine performance data — run backfill" }
    } else {
      const totalRuns = data.reduce((sum, r) => sum + (r.total_runs || 0), 0)
      const avgRate = data.reduce((sum, r) => sum + (r.win_rate_last_10 || 0), 0) / data.length
      checks.engine_performance = {
        ok: true,
        detail: `${data.length} rows, ${totalRuns} total runs, avg hit rate ${(avgRate * 100).toFixed(1)}%`,
      }
    }
  } catch (e) {
    checks.engine_performance = { ok: false, detail: String(e) }
  }

  // 4. Predictions cache — check freshness
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from("predictions_cache")
      .select("date, turno, computed_at")
      .order("computed_at", { ascending: false })
      .limit(1)
      .single()

    if (error) {
      checks.predictions_cache = { ok: false, detail: error.message }
    } else if (data?.computed_at) {
      const lastComputed = new Date(data.computed_at)
      const diffMinutes = (Date.now() - lastComputed.getTime()) / 60000
      checks.predictions_cache = {
        ok: diffMinutes < 180,
        detail: `Last precompute: ${Math.round(diffMinutes)}min ago (${data.turno})`,
      }
    } else {
      checks.predictions_cache = { ok: false, detail: "No predictions in cache" }
    }
  } catch (e) {
    checks.predictions_cache = { ok: false, detail: String(e) }
  }

  // 5. Overall status — 200 always (degraded is not an error)
  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  )
}
