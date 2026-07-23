import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import logger from "@/lib/logger"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

export async function GET(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno")
  const model_type = searchParams.get("model_type")
  const start_date = searchParams.get("start_date")
  const end_date = searchParams.get("end_date")
  const limit = parseInt(searchParams.get("limit") || "100")

  try {
    const params = new URLSearchParams({
      select: "turno,model_type,test_date,hit_at_1_2c,hit_at_5_2c,hit_at_10_2c,rank_2c,score_2c,roi_2c",
      order: "test_date.desc",
      limit: limit.toString()
    })
    if (turno) params.append("turno", `eq.${turno}`)
    if (model_type) params.append("model_type", `eq.${model_type}`)
    if (start_date) params.append("test_date", `gte.${start_date}`)
    if (end_date) params.append("test_date", `lte.${end_date}`)

    const res = await fetch(`${SB()}/rest/v1/backtest_results?${params}`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) throw new Error(`Supabase error: ${res.status}`)
    const rows = await res.json()

    // Aggregate summary
    const summary = rows.reduce((acc: any, row: any) => {
      const key = `${row.turno}/${row.model_type}`
      if (!acc[key]) {
        acc[key] = { turno: row.turno, model_type: row.model_type, count: 0, hits_1: 0, hits_5: 0, hits_10: 0, roi_sum: 0 }
      }
      acc[key].count++
      acc[key].hits_1 += row.hit_at_1_2c ? 1 : 0
      acc[key].hits_5 += row.hit_at_5_2c ? 1 : 0
      acc[key].hits_10 += row.hit_at_10_2c ? 1 : 0
      acc[key].roi_sum += row.roi_2c || 0
      return acc
    }, {})

    const aggregated = Object.values(summary).map((s: any) => ({
      ...s,
      hit_at_1_pct: +(100 * s.hits_1 / s.count).toFixed(2),
      hit_at_5_pct: +(100 * s.hits_5 / s.count).toFixed(2),
      hit_at_10_pct: +(100 * s.hits_10 / s.count).toFixed(2),
      avg_roi: +(s.roi_sum / s.count).toFixed(2)
    }))

    return NextResponse.json({ ok: true, total_rows: rows.length, summary: aggregated, detail: rows })
  } catch (e: any) {
    logger.error("backtest-get: failed", { error: e.message })
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const mlBackendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL
  const mlSecret = process.env.PYTHON_API_SECRET

  if (!mlBackendUrl || !mlSecret) {
    return NextResponse.json({ ok: false, message: "ML backend not configured" }, { status: 500 })
  }

  try {
    const body = await req.json()
    const res = await fetch(`${mlBackendUrl}/api/backtest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": mlSecret
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120000) // backtest puede tardar
    })
    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (e: any) {
    logger.error("backtest-post: failed", { error: e.message })
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}