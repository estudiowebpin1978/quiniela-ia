import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    message: "HELLO TEST",
    timestamp: new Date().toISOString(),
    source: "test-new-endpoint-v7"
  });
}