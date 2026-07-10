import { NextRequest, NextResponse } from "next/server"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLAN_DAYS: Record<string, number> = {
  semanal: 7,
  mensual: 30,
}

export async function POST(req: NextRequest) {
  // Shared secret check
  const webhookSecret = process.env.UALA_WEBHOOK_SECRET || "";
  if (webhookSecret) {
    const incomingSecret = req.headers.get("x-webhook-secret") || "";
    if (incomingSecret !== webhookSecret) {
      return NextResponse.json({ ok: false, message: "Invalid secret" }, { status: 401 });
    }
  }

  // 1. Parse body
  let rawBody: any
  try {
    rawBody = await req.json()
  } catch {
    console.error("[UALA WEBHOOK] Could not parse body as JSON")
    return NextResponse.json({ ok: true })
  }

  console.log("[webhook-uala] Received payment notification")

  // 2. Extract fields — handle multiple possible Ualá payload structures
  const body = rawBody?.data ? rawBody.data : rawBody // some APIs nest under .data

  const orderId = body?.id || body?.order_id || body?.payment_id || null
  const status = (body?.status || body?.state || body?.payment_status || "").toString().toUpperCase()
  const userId = body?.external_reference || body?.external_id || body?.user_id || null
  const amountRaw = body?.amount || body?.transaction_amount || body?.total_amount || "0"
  const amount = parseFloat(String(amountRaw).replace(",", "."))

  // 3. Only process approved/completed payments
  if (status !== "APPROVED" && status !== "COMPLETED") {
    return NextResponse.json({ ok: true, message: `Status ${status} ignored` })
  }

  if (!userId) {
    return NextResponse.json({ ok: true, message: "No userId" })
  }

  // 4. Determine plan from amount
  let plan = "mensual"
  if (amount > 0 && amount <= 3600) plan = "semanal"
  const days = PLAN_DAYS[plan] || 30
  const premiumUntil = new Date(Date.now() + days * 86400000).toISOString()

  // 5. Check if user exists and has active premium
  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  const queryUrl = `${SB_URL()}/rest/v1/user_profiles?id=eq.${safeId}&select=id,role,premium_until&limit=1`

  const profRes = await fetch(
    queryUrl,
    {
      headers: {
        "apikey": SB_KEY(),
        Authorization: `Bearer ${SB_KEY()}`,
      },
    }
  )

  if (!profRes.ok) {
    const errText = await profRes.text()
    console.error("[UALA WEBHOOK] Failed to fetch user profile:", profRes.status, errText)
    try {
      await fetch(`${SB_URL()}/rest/v1/webhook_logs`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          source: "uala",
          payload: JSON.stringify({ orderId, status, amount }),
          user_id: safeId,
          error: `${profRes.status}: ${errText}`,
          created_at: new Date().toISOString(),
        }),
      })
    } catch {}
    return NextResponse.json({ ok: true })
  }

  const profiles = await profRes.json()
  let profile = profiles?.[0]

  if (!profile) {
    const createRes = await fetch(`${SB_URL()}/rest/v1/user_profiles`, {
      method: "POST",
      headers: {
        "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`,
        "Content-Type": "application/json", Prefer: "return=representation",
      },
      body: JSON.stringify({ id: userId, email: "", role: "free" }),
    })
    if (createRes.ok) {
      const created = await createRes.json()
      profile = created?.[0]
    } else {
      const errText = await createRes.text()
      console.error(`[UALA WEBHOOK] Failed to create user_profiles: ${createRes.status}`, errText)
      return NextResponse.json({ ok: true, message: "Could not create profile" })
    }
  }

  console.log(`[UALA WEBHOOK] Found user profile: role=${profile.role}`)

  // Don't overwrite admin users
  if (profile.role === "admin") {
    return NextResponse.json({ ok: true, message: "Admin user, skipped" })
  }

  // 6. Extend premium if already active, otherwise set fresh
  let finalPremiumUntil = premiumUntil
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) {
    const currentExpiry = new Date(profile.premium_until)
    finalPremiumUntil = new Date(currentExpiry.getTime() + days * 86400000).toISOString()
  }

  // 7. Update user profile
  const updateRes = await fetch(
    `${SB_URL()}/rest/v1/user_profiles?id=eq.${safeId}`,
    {
      method: "PATCH",
      headers: {
        "apikey": SB_KEY(),
        Authorization: `Bearer ${SB_KEY()}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        role: "premium",
        premium_until: finalPremiumUntil,
      }),
    }
  )

  if (!updateRes.ok) {
    const errText = await updateRes.text()
    console.error("[UALA WEBHOOK] Failed to update user profile:", updateRes.status, errText)
    return NextResponse.json({ ok: true })
  }

  console.log(`[webhook-uala] Premium activated: ${plan} until ${finalPremiumUntil}`)
  return NextResponse.json({ ok: true })
}
