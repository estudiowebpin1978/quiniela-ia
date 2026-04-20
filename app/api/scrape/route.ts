import { NextRequest, NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ 
    test: "NEW_ENDPOINT_WORKING", 
    time: new Date().toISOString() 
  });
}