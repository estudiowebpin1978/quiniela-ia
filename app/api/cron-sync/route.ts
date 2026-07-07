/**
 * @deprecated Use /api/cron-scrape instead.
 * This endpoint is kept for backward compatibility but returns 410 Gone.
 */
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json(
    { 
      error: "Gone", 
      message: "Este endpoint está deprecado. Usá /api/cron-scrape para scraping diario o /api/cron-nacional?fill=deep para backfill." 
    }, 
    { status: 410 }
  )
}