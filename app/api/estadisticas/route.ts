import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'
export const fetchCache = 'no-store'

export async function GET(req: NextRequest){
  console.log('DEBUG: estadisticas called')
  return NextResponse.json({
    totalSorteos:60,
    pct:30,
    racha:5,
    mensaje:"60 sorteos · 30% precision"
  })
}
