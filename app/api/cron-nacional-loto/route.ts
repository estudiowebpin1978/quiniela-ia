/**
 * @deprecated Use /api/cron-scrape instead.
 * This endpoint used a different source (Ruta1000) and heavy deps (axios/cheerio).
 * Consolidated into single scraper pipeline.
 */
import { NextResponse } from "next/server"

export async function GET() {
  return NextResponse.json(
    { 
      error: "Gone", 
      message: "Endpoint deprecado. Scraping unificado en /api/cron-scrape (hoy) y /api/cron-nacional?fill=deep (backfill)." 
    }, 
    { status: 410 }
  )
}