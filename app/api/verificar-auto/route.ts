import { NextRequest, NextResponse } from "next/server"
import { ADMIN_EMAILS } from "@/lib/config"
import { validateJwt } from "@/lib/auth/jwt"
import { autoVerifyPredictions, getVerificationStats } from "@/lib/verificacion/auto-verify"
import { isJsonRecord } from "@/lib/json-response"

async function isAdmin(token: string): Promise<boolean> {
  const decoded = await validateJwt(token)
  if (!decoded?.email) return false
  return ADMIN_EMAILS.includes(decoded.email.toLowerCase())
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  if (!isJsonRecord(body)) return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  const fecha = typeof body.fecha === "string" ? body.fecha : ""
  const turno = typeof body.turno === "string" ? body.turno : ""

  if (!fecha || !turno) {
    return NextResponse.json({ error: "Faltan fecha y turno" }, { status: 400 })
  }

  const results = await autoVerifyPredictions(fecha, turno)

  return NextResponse.json({
    ok: true,
    verified: results.length,
    results: results.map(r => ({
      id: r.id,
      aciertos_2: r.aciertos_2.length,
      aciertos_3: r.aciertos_3.length,
      aciertos_4: r.aciertos_4.length,
      total_aciertos: r.total_aciertos,
    })),
  })
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const userId = searchParams.get("userId") || undefined
  const days = Number(searchParams.get("days")) || 30

  const stats = await getVerificationStats(userId, days)
  return NextResponse.json({ ok: true, stats })
}
