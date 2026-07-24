import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { revalidatePath } from "next/cache"
import logger from "@/lib/logger"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const PLAN_DAYS: Record<string, number> = {
  semanal: 7,
  mensual: 30,
}

function safeCompare(a: string, b: string): boolean {
  if (!a || !b) return false
  const maxLen = Math.max(a.length, b.length)
  const bufA = Buffer.from(a.padEnd(maxLen, "\0"))
  const bufB = Buffer.from(b.padEnd(maxLen, "\0"))
  return timingSafeEqual(bufA, bufB)
}

/**
 * Verify payment with Ualá Bis API (real integration).
 * This function should be called to verify the payment status
 * before activating premium access.
 */
async function verifyUalaPayment(paymentId: string): Promise<{ verified: boolean; status: string; amount?: number }> {
  const ualaApiKey = process.env.UALA_API_KEY
  const ualaBaseUrl = process.env.UALA_BASE_URL || "https://api.uala.com.ar"
  
  if (!ualaApiKey) {
    logger.error("[webhook-uala] UALA_API_KEY not configured — CANNOT verify payment, rejecting")
    return { verified: false, status: "UNVERIFIED" }
  }

  try {
    const response = await fetch(`${ualaBaseUrl}/payments/${paymentId}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${ualaApiKey}`,
        "Content-Type": "application/json"
      },
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) {
      logger.error("[webhook-uala] Ualá API verification failed", { status: response.status })
      return { verified: false, status: "ERROR" }
    }

    const data = await response.json()
    return {
      verified: true,
      status: data.status || "UNKNOWN",
      amount: data.amount
    }
  } catch (error) {
    logger.error("[webhook-uala] Ualá API error", { error: String(error) })
    return { verified: false, status: "ERROR" }
  }
}

export async function POST(req: NextRequest) {
  const webhookSecret = process.env.UALA_WEBHOOK_SECRET
  if (!webhookSecret) {
    logger.error("[webhook-uala] UALA_WEBHOOK_SECRET is not configured")
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const incomingSecret = req.headers.get("x-webhook-secret") || ""
  if (!safeCompare(incomingSecret, webhookSecret)) {
    return NextResponse.json({ ok: false, message: "Invalid secret" }, { status: 401 })
  }

  let rawBody: any
  try {
    rawBody = await req.json()
  } catch {
    logger.warn("[webhook-uala] Could not parse body as JSON")
    return NextResponse.json({ ok: true })
  }

  logger.info("[webhook-uala] Received payment notification")

  const body = rawBody?.data ? rawBody.data : rawBody

  const orderId = body?.id || body?.order_id || body?.payment_id || null
  const status = (body?.status || body?.state || body?.payment_status || "").toString().toUpperCase()
  const userId = body?.external_reference || body?.external_id || body?.user_id || null
  const amountRaw = body?.amount || body?.transaction_amount || body?.total_amount || "0"
  const amount = parseFloat(String(amountRaw).replace(",", "."))

  if (status !== "APPROVED" && status !== "COMPLETED") {
    return NextResponse.json({ ok: true, message: `Status ${status} ignored` })
  }

  if (!userId) {
    return NextResponse.json({ ok: true, message: "No userId" })
  }

  // Validate userId is a valid UUID
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_REGEX.test(String(userId))) {
    return NextResponse.json({ ok: true, message: "Invalid userId format" })
  }

  // Idempotency: check if this orderId was already processed
  if (orderId) {
    try {
      const existingLog = await fetch(
        `${SB_URL()}/rest/v1/webhook_logs?payload=cs.${encodeURIComponent(JSON.stringify({ orderId }))}&select=id&limit=1`,
        { headers: { apikey: SB_KEY(), Authorization: `Bearer ${SB_KEY()}` } }
      )
      if (existingLog.ok) {
        const logs = await existingLog.json()
        if (Array.isArray(logs) && logs.length > 0) {
          logger.info("[webhook-uala] Duplicate orderId, skipping", { orderId })
          return NextResponse.json({ ok: true, message: "Already processed" })
        }
      }
    } catch {
      // If webhook_logs table doesn't exist, continue processing
    }
  }

  // Verify payment with Ualá Bis API (real integration)
  if (orderId) {
    const verification = await verifyUalaPayment(String(orderId))
    if (!verification.verified) {
      logger.warn("[webhook-uala] Payment verification failed", { orderId, status: verification.status })
      return NextResponse.json({ ok: true, message: "Payment not verified" })
    }
    // Use verified amount if available
    if (verification.amount !== undefined) {
      const verifiedAmount = verification.amount
      logger.info("[webhook-uala] Payment verified", { orderId, amount: verifiedAmount })
    }
  }

  let plan = "mensual"
  if (amount > 0 && amount <= 3600) plan = "semanal"
  const days = PLAN_DAYS[plan] || 30
  const premiumUntil = new Date(Date.now() + days * 86400000).toISOString()

  const safeId = String(userId).replace(/[^a-zA-Z0-9_-]/g, "")
  const queryUrl = `${SB_URL()}/rest/v1/user_profiles?id=eq.${safeId}&select=id,role,premium_until&limit=1`

  const profRes = await fetch(queryUrl, {
    headers: { "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}` },
  })

  if (!profRes.ok) {
    const errText = await profRes.text()
    logger.error("[webhook-uala] Failed to fetch user profile", { status: profRes.status, error: errText })
    try {
      await fetch(`${SB_URL()}/rest/v1/webhook_logs`, {
        method: "POST",
        headers: { "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({
          source: "uala", payload: JSON.stringify({ orderId, status, amount }),
          user_id: safeId, error: "Profile fetch failed", created_at: new Date().toISOString(),
        }),
      })
    } catch {}
    return NextResponse.json({ ok: false, error: "Profile fetch failed" }, { status: 500 })
  }

  const profiles = await profRes.json()
  let profile = profiles?.[0]

  if (!profile) {
    const createRes = await fetch(`${SB_URL()}/rest/v1/user_profiles`, {
      method: "POST",
      headers: { "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ id: userId, email: "", role: "free" }),
    })
    if (createRes.ok) {
      const created = await createRes.json()
      profile = created?.[0]
    } else {
      logger.error("[webhook-uala] Failed to create user_profiles", { status: createRes.status })
      return NextResponse.json({ ok: false, error: "Could not create profile" }, { status: 500 })
    }
  }

  logger.info("[webhook-uala] Found user profile", { role: profile.role })

  if (profile.role === "admin") {
    return NextResponse.json({ ok: true, message: "Admin user, skipped" })
  }

  let finalPremiumUntil = premiumUntil
  if (profile.premium_until && new Date(profile.premium_until) > new Date()) {
    const currentExpiry = new Date(profile.premium_until)
    finalPremiumUntil = new Date(currentExpiry.getTime() + days * 86400000).toISOString()
  }

  const updateRes = await fetch(`${SB_URL()}/rest/v1/user_profiles?id=eq.${safeId}`, {
    method: "PATCH",
    headers: { "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ role: "premium", premium_until: finalPremiumUntil }),
  })

  if (!updateRes.ok) {
    const errText = await updateRes.text()
    logger.error("[webhook-uala] Failed to update user profile", { status: updateRes.status, error: errText })
    return NextResponse.json({ ok: true })
  }

  // Revalidate dashboard after successful payment
  try {
    revalidatePath('/dashboard', 'page')
    revalidatePath('/predictions', 'page')
  } catch (error) {
    logger.warn("[webhook-uala] Failed to revalidate paths", { error: String(error) })
  }

  logger.info("[webhook-uala] Premium activated", { plan, until: finalPremiumUntil })
  return NextResponse.json({ ok: true })
}
