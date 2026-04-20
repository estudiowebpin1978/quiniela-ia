import { NextRequest, NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const dateParam = req.nextUrl.searchParams.get("date");
  const now = new Date();
  
  return NextResponse.json({
    message: "API working",
    received: {
      secret: secret ? "yes" : "no",
      date: dateParam
    },
    current_time: {
      hour: now.getHours(),
      iso: now.toISOString()
    },
    hint: "Pass date=YYYY-MM-DD to scrape historical data"
  });
}