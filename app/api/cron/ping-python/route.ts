/**
 * Keep-alive ping for ML Backend (FastAPI).
 * Called by cron-job.org every 14 minutes to prevent cold start suspension
 * on free-tier hosting (Render, Railway, etc.).
 *
 * This endpoint does NOT require auth - it's a simple health check.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import logger from "@/lib/logger"

export async function GET(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) {
    return unauthorizedResponse()
  }

  const mlBackendUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL
  if (!mlBackendUrl) {
    return NextResponse.json({
      ok: false,
      message: "NEXT_PUBLIC_PYTHON_API_URL not configured",
    })
  }

  try {
    const start = Date.now()
    const res = await fetch(`${mlBackendUrl}/health`, {
      signal: AbortSignal.timeout(10000),
    })
    const elapsed = Date.now() - start

    if (res.ok) {
      const data = await res.json()
      logger.info("ping-python: alive", { elapsed_ms: elapsed, status: data.status })
      return NextResponse.json({
        ok: true,
        message: "ML Backend is alive",
        latency_ms: elapsed,
        backend_status: data,
      })
    } else {
      logger.warn("ping-python: unhealthy", { status: res.status })
      return NextResponse.json({
        ok: false,
        message: `ML Backend returned ${res.status}`,
        latency_ms: elapsed,
      })
    }
  } catch (e: unknown) {
    const err = e as { name?: string; message?: string }
    logger.warn("ping-python: unreachable", { error: err?.message || String(e) })
    return NextResponse.json({
      ok: false,
      message: "ML Backend unreachable (cold start or down)",
      error: err?.message,
    })
  }
}
