/**
 * /api/health — Public health check endpoint.
 * Returns 200 if system is healthy, 500 if degraded.
 * Used by cron-job.org as a Dead Man's Switch.
 *
 * Checks:
 * 1. Supabase connectivity
 * 2. Scraper freshness (last draw < 2h old)
 */

import { NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const runtime = "nodejs"
export const maxDuration = 10

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
      const nowBue = new Date(
        new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }),
      )
      const diffMinutes = (nowBue.getTime() - lastScrape.getTime()) / 60000
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

  // 3. Overall status
  const allOk = Object.values(checks).every((c) => c.ok)

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      checks,
      timestamp: new Date().toISOString(),
    },
    { status: allOk ? 200 : 500 },
  )
}
