/**
 * /api/cron-autopilot — DEPRECATED
 *
 * This endpoint has been removed. Predictions are now generated on-demand
 * when the user requests them via GET /api/predictions.
 *
 * Verification happens automatically when official draws are loaded via
 * the cron-scrape endpoint (trg_verify_on_official_draw trigger).
 */
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json({
    ok: false,
    deprecated: true,
    message: "Autopilot removed. Predictions are on-demand via GET /api/predictions.",
  }, { status: 410 })
}
