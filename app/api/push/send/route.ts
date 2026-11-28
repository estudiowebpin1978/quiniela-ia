import { NextRequest, NextResponse } from "next/server"
import { sendPushToAll, getSubscriptionCount } from "@/lib/push/send"
import { getSupabaseUrl, getSupabaseKey, isAdminEmail } from "@/lib/config"
import { validateJwt } from "@/lib/auth/jwt"
import { isJsonRecord } from "@/lib/json-response"

const SB = getSupabaseUrl()
const SK = getSupabaseKey()

async function isAdmin(token: string): Promise<boolean> {
  const decoded = await validateJwt(token)
  if (!decoded) return false
  return isAdminEmail(decoded.email)
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
  if (!isJsonRecord(body)) {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }
  const title = "title" in body && typeof body.title === "string" ? body.title : ""
  const msgBody = "body" in body && typeof body.body === "string" ? body.body : ""
  const url = "url" in body && typeof body.url === "string" ? body.url : undefined
  const data = "data" in body && isJsonRecord(body.data)
    ? body.data
    : {}

  if (!title || !msgBody) {
    return NextResponse.json({ error: "Faltan title y body" }, { status: 400 })
  }

  const subCount = await getSubscriptionCount()
  if (subCount === 0) {
    return NextResponse.json({ error: "No hay suscriptores" }, { status: 400 })
  }

  const result = await sendPushToAll({
    title,
    body: msgBody,
    url: url || "/predictions",
    data: data || {},
  })

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    failed: result.failed,
    totalSubscribers: subCount,
  })
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const count = await getSubscriptionCount()
  return NextResponse.json({ ok: true, subscribers: count })
}
