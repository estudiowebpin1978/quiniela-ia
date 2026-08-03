import { NextRequest, NextResponse } from "next/server"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const SB = getSupabaseUrl()
  const SK = getSupabaseKey()
  if (!SB || !SK) return NextResponse.json({ error: "Config error" }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get("limit") || "30"), 100)

  try {
    const res = await fetch(
      `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc,created_at.desc&limit=${limit}`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, next: { revalidate: 300 } }
    )
    const rows = await res.json()
    return NextResponse.json(Array.isArray(rows) ? rows : [])
  } catch {
    return NextResponse.json([])
  }
}
