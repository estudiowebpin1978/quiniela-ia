import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  
  if (secret !== "quiniela_ia_cron_2024_seguro") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    test: "ruta1000 endpoint works",
    timestamp: new Date().toISOString()
  });
}