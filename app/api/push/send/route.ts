import { NextRequest, NextResponse } from "next/server"
import { sendPushToAll, getSubscriptionCount } from "@/lib/push/send"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

async function isAdmin(token: string): Promise<boolean> {
  const adminEmail = process.env.ADMIN_EMAIL || "estudiowebpin@gmail.com"
  try {
    const r = await fetch(`${SB()}/auth/v1/user`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${token}` }
    })
    if (!r.ok) return false
    const user = await r.json()
    return user.email === adminEmail
  } catch { return false }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!await isAdmin(token)) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { title, body: msgBody, url, data } = body

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
