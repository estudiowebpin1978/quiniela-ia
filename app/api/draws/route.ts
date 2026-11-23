import { NextRequest, NextResponse } from "next/server"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

const noCacheHeaders = { "Cache-Control": "no-store, max-age=0, must-revalidate" }

export async function GET(req: NextRequest) {
  const SB = getSupabaseUrl()
  const SK = getSupabaseKey()
  if (!SB || !SK) return NextResponse.json({ error: "Config error" }, { status: 500, headers: noCacheHeaders })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "30") || 30, 100)

  try {
    const res = await fetch(
      `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc,created_at.desc&limit=${limit}`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, cache: "no-store" }
    )
    if (!res.ok) {
      logger.error("[draws] Supabase request failed", { status: res.status })
      return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 502, headers: noCacheHeaders })
    }
    const rows = await res.json()
    return NextResponse.json(Array.isArray(rows) ? rows : [], { headers: noCacheHeaders })
  } catch (error) {
    logger.error("[draws] Request failed", { error: String(error) })
    return NextResponse.json({ error: "No se pudo cargar el historial" }, { status: 502, headers: noCacheHeaders })
  }
}
