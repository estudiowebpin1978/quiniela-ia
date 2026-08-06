import { NextResponse } from "next/server"

export async function GET() {
  try {
    const { checkRateLimit, RATE_LIMIT_PRESETS } = await import("@/lib/rate-limiter")
    const rl = await checkRateLimit("test-probe", RATE_LIMIT_PRESETS.GENERAL_API)
    return NextResponse.json({ ok: true, rl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
