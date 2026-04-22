import { NextResponse } from "next/server"

export async function GET(){
  return NextResponse.json({
    totalSorteos:60,
    pct:30,
    racha:5,
    mensaje:"60 sorteos · 30% precision"
  })
}
