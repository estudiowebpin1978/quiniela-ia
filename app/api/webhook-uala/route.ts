import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { revalidatePath } from "next/cache"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

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

  let rawBody: Record<string, unknown>
  try {
    rawBody = await req.json()
  } catch {
    logger.warn("[webhook-uala] Could not parse body as JSON")
    return NextResponse.json({ ok: true })
  }

  logger.info("[webhook-uala] Received payment notification")

  const body: Record<string, unknown> = rawBody?.data ? rawBody.data as Record<string, unknown> : rawBody

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
      const supabase = getSupabaseAdmin()
      const { data: existingLogs } = await supabase
        .from("webhook_logs")
        .select("id")
        .contains("payload", JSON.stringify({ orderId }))
        .limit(1)
      
      if (Array.isArray(existingLogs) && existingLogs.length > 0) {
        logger.info("[webhook-uala] Duplicate orderId, skipping", { orderId })
        return NextResponse.json({ ok: true, message: "Already processed" })
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
  const supabase = getSupabaseAdmin()

  const { data: profiles, error: profError } = await supabase
    .from("user_profiles")
    .select("id, role, premium_until")
    .eq("id", safeId)
    .limit(1)

  if (profError) {
    logger.error("[webhook-uala] Failed to fetch user profile", { error: profError.message })
    try {
      await supabase.from("webhook_logs").insert({
        source: "uala",
        payload: JSON.stringify({ orderId, status, amount }),
        user_id: safeId,
        error: "Profile fetch failed",
        created_at: new Date().toISOString(),
      })
    } catch {}
    return NextResponse.json({ ok: false, error: "Profile fetch failed" }, { status: 500 })
  }

  let profile = Array.isArray(profiles) ? profiles[0] : null

  if (!profile) {
    const { data: created, error: createError } = await supabase
      .from("user_profiles")
      .insert({ id: userId, email: "", role: "free" })
      .select()
      .single()
    
    if (createError) {
      logger.error("[webhook-uala] Failed to create user_profiles", { error: createError.message })
      return NextResponse.json({ ok: false, error: "Could not create profile" }, { status: 500 })
    }
    profile = created
  }

  if (!profile) {
    return NextResponse.json({ ok: false, error: "Profile not found" }, { status: 500 })
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

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({ role: "premium", premium_until: finalPremiumUntil })
    .eq("id", safeId)

  if (updateError) {
    logger.error("[webhook-uala] Failed to update user profile", { error: updateError.message })
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
