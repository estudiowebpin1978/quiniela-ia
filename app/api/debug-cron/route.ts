import { NextResponse } from "next/server"

export async function GET() {
  const secret = process.env.CRON_SECRET
  return NextResponse.json({
    configured: !!secret,
    length: secret?.length || 0,
    first4: secret?.substring(0, 4) || "none",
  })
}
