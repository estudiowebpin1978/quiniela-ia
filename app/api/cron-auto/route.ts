import { NextRequest, NextResponse } from "next/server"

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret")
  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, "0")
  const d = String(today.getDate()).padStart(2, "0")
  const fecha = `${y}-${m}-${d}`

  const qnRes = await fetch(`https://quiniela-ia-two.vercel.app/api/cron?secret=${CRON_SECRET}&turno=todos`)
  const qnData = await qnRes.json()
  const okCount = qnData?.results?.filter((r: any) => r.ok).length || 0

  return NextResponse.json({
    ok: okCount > 0,
    fecha,
    guardados: okCount,
    source: "Quiniela Nacional Buenos Aires",
    sorteos: qnData.results,
    message: `Quiniela Nacional: ${okCount}/5 sorteos guardados`
  })
}