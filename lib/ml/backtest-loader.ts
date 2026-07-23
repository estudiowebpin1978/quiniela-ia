import { NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

// In-memory cache for backtest summary
const backtestCache = new Map<string, { data: any; expiresAt: number }>()

export async function getBacktestSummary(turno: string, modelType: string = "ensemble"): Promise<any> {
  const cacheKey = `${turno}/${modelType}`
  const cached = backtestCache.get(cacheKey)
  
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data
  }
  
  try {
    const params = new URLSearchParams({
      select: "turno,model_type,hit_at_1_2c,hit_at_5_2c,hit_at_10_2c,roi_2c,test_date",
      turno: `eq.${turno}`,
      model_type: `eq.${modelType}`,
      order: "test_date.desc",
      limit: "500"
    })
    
    const res = await fetch(`${SB()}/rest/v1/backtest_results?${params}`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` },
      signal: AbortSignal.timeout(5000)
    })
    
    if (!res.ok) return null
    const rows = await res.json()
    
    if (!rows?.length) return null
    
    // Aggregate
    const total = rows.length
    const hits_1 = rows.filter((r: any) => r.hit_at_1_2c).length
    const hits_5 = rows.filter((r: any) => r.hit_at_5_2c).length
    const hits_10 = rows.filter((r: any) => r.hit_at_10_2c).length
    const roi_sum = rows.reduce((sum: number, r: any) => sum + (r.roi_2c || 0), 0)
    
    const summary = {
      total_tests: total,
      hit_at_1_pct: Math.round(100.0 * hits_1 / total * 100) / 100,
      hit_at_5_pct: Math.round(100.0 * hits_5 / total * 100) / 100,
      hit_at_10_pct: Math.round(100.0 * hits_10 / total * 100) / 100,
      avg_roi: Math.round(roi_sum / total * 100) / 100,
      model_type: modelType,
    }
    
    // Cache for 10 minutes
    backtestCache.set(cacheKey, { data: summary, expiresAt: Date.now() + 600_000 })
    
    return summary
  } catch (e) {
    logger.warn("backtest-loader: failed", { error: String(e) })
    return null
  }
}

export async function invalidateBacktestCache(turno?: string) {
  if (turno) {
    for (const key of backtestCache.keys()) {
      if (key.startsWith(`${turno}/`)) backtestCache.delete(key)
    }
  } else {
    backtestCache.clear()
  }
}