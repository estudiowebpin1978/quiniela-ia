import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")?.replace("Bearer ", "")
  if (authHeader !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = getSupabaseAdmin()

  const { data: predictions, error: predErr } = await supabase
    .from("user_predictions")
    .select("id,numeros")
    .limit(200)

  if (predErr || !predictions?.length) {
    return NextResponse.json({ error: predErr?.message || "No predictions" }, { status: 500 })
  }

  let fixed = 0
  let skipped = 0

  for (const pred of predictions) {
    let numerosData: number[] | Record<string, string[]> = pred.numeros as number[] | Record<string, string[]>

    if (Array.isArray(numerosData) && numerosData.length === 1 && typeof numerosData[0] === "string") {
      try { numerosData = JSON.parse(numerosData[0] as string) as Record<string, string[]> } catch { continue }
    }

    if (Array.isArray(numerosData)) {
      skipped++
      continue
    }

    if (!numerosData || typeof numerosData !== "object") {
      skipped++
      continue
    }

    const nums2 = numerosData["2"] || []
    const hasBad2 = nums2.some((n: string) => n.length > 2)

    if (!hasBad2) {
      skipped++
      continue
    }

    const norm2 = (v: string) => { const s = String(v).replace(/^0+/, ''); return s.slice(-2).padStart(2, '0') }
    const norm3 = (v: string) => { const s = String(v).replace(/^0+/, ''); return s.slice(-3).padStart(3, '0') }
    const norm4 = (v: string) => String(v).padStart(4, '0')

    const fixed2 = nums2.map(norm2)
    const fixed3 = (numerosData["3"] || []).map(norm3)
    const fixed4 = (numerosData["4"] || []).map(norm4)
    const rbl = numerosData["r"] || []

    const newNumeros = [JSON.stringify({ "2": fixed2, "3": fixed3, "4": fixed4, "r": rbl })]

    const { error: updErr } = await supabase
      .from("user_predictions")
      .update({ numeros: newNumeros })
      .eq("id", pred.id)

    if (!updErr) fixed++
  }

  return NextResponse.json({ fixed, skipped, total: predictions.length })
}
