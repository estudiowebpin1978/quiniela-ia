import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ 
    message: "HELLO TEST v8",
    timestamp: new Date().toISOString()
  });
}