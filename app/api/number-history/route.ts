/**
 * API: Historical data for a specific number
 * GET /api/number-history?number=42
 * Returns frequency, gaps, recent appearances, and trend data.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const numStr = req.nextUrl.searchParams.get("number")

  if (!numStr) {
    return NextResponse.json({ error: "number required" }, { status: 400 })
  }

  const targetNum = parseInt(numStr)
  if (isNaN(targetNum) || targetNum < 0 || targetNum > 99) {
    return NextResponse.json({ error: "number must be 0-99" }, { status: 400 })
  }

  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase.rpc("get_number_history", { p_number: targetNum })

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: "No data" }, { status: 404 })
    }

    return NextResponse.json(data)
  } catch (e: unknown) {
    const err = e as { message?: string }
    return NextResponse.json({ error: err.message || "Error" }, { status: 500 })
  }
}
