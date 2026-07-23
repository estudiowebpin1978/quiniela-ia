/**
 * Reglas de negocio Free vs Premium (única fuente de verdad).
 *
 * Free: trial 30 días, máx. 10 predicciones guardadas, solo 2 cifras.
 * Premium/Admin: ilimitado + 3 cifras, 4 cifras y redoblona.
 */

export const FREE_TRIAL_DAYS = 30
export const FREE_MAX_PREDICTIONS = 10
export const ADMIN_EMAILS = ["estudiowebpin@gmail.com"]

export type UserTier = {
  userId: string | null
  email: string | null
  role: "free" | "premium" | "admin"
  isPremium: boolean
  isTrialActive: boolean
  trialExpired: boolean
  canAccess2Cifras: boolean
  canAccessPremiumFeatures: boolean
  canSavePrediction: boolean
  predictionsUsed: number
  predictionsRemaining: number
  premium_until: string | null
  daysRemaining: number | null
}

const emptyTier = (overrides: Partial<UserTier> = {}): UserTier => ({
  userId: null,
  email: null,
  role: "free",
  isPremium: false,
  isTrialActive: false,
  trialExpired: false,
  canAccess2Cifras: false,
  canAccessPremiumFeatures: false,
  canSavePrediction: false,
  predictionsUsed: 0,
  predictionsRemaining: 0,
  premium_until: null,
  daysRemaining: null,
  ...overrides,
})

function sbUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
}
function sbKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
}

export function trialUntilISO(from = Date.now()): string {
  return new Date(from + FREE_TRIAL_DAYS * 86400000).toISOString()
}

export async function ensureUserProfile(userId: string, email: string): Promise<void> {
  const SB = sbUrl()
  const SK = sbKey()
  if (!SB || !SK || !userId) return
  try {
    const r = await fetch(`${SB}/rest/v1/user_profiles?id=eq.${userId}&select=id&limit=1`, {
      headers: { apikey: SK, Authorization: `Bearer ${SK}` },
      signal: AbortSignal.timeout(4000),
    })
    const rows = await r.json()
    if (Array.isArray(rows) && rows.length > 0) return
    await fetch(`${SB}/rest/v1/user_profiles`, {
      method: "POST",
      headers: {
        apikey: SK,
        Authorization: `Bearer ${SK}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({
        id: userId,
        email: email || "",
        role: "free",
        premium_until: trialUntilISO(),
        created_at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(4000),
    })
  } catch { /* noop */ }
}

async function countUserPredictions(userId: string): Promise<number> {
  const SB = sbUrl()
  const SK = sbKey()
  if (!SB || !SK) return 0
  try {
    const r = await fetch(
      `${SB}/rest/v1/user_predictions?user_id=eq.${userId}&select=id`,
      {
        headers: { apikey: SK, Authorization: `Bearer ${SK}`, Prefer: "count=exact" },
        signal: AbortSignal.timeout(4000),
      }
    )
    const range = r.headers.get("content-range")
    if (range) {
      const total = parseInt(range.split("/")[1] || "0", 10)
      if (!isNaN(total)) return total
    }
    const rows = await r.json()
    return Array.isArray(rows) ? rows.length : 0
  } catch {
    return 0
  }
}

/**
 * Resuelve el tier del usuario a partir del JWT de Supabase Auth.
 */
export async function resolveUserTier(token: string): Promise<UserTier> {
  if (!token) return emptyTier()
  const SB = sbUrl()
  const SK = sbKey()
  if (!SB || !SK) return emptyTier()

  try {
    const userRes = await fetch(`${SB}/auth/v1/user`, {
      headers: { apikey: SK, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    })
    if (!userRes.ok) return emptyTier()
    const user = await userRes.json()
    if (!user?.id) return emptyTier()

    await ensureUserProfile(user.id, user.email || "")

    const profRes = await fetch(
      `${SB}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until,created_at&limit=1`,
      { headers: { apikey: SK, Authorization: `Bearer ${SK}` }, signal: AbortSignal.timeout(4000) }
    )
    const profiles = await profRes.json()
    const profile = Array.isArray(profiles) ? profiles[0] : null

    const isAdmin = ADMIN_EMAILS.includes((user.email || "").toLowerCase())
    const dbRole = (profile?.role || "free") as string
    const role: UserTier["role"] = isAdmin ? "admin" : dbRole === "admin" ? "free" : (dbRole as UserTier["role"])

    const until = profile?.premium_until ? new Date(profile.premium_until) : null
    const untilValid = !!(until && until.getTime() > Date.now())

    const isPremiumRole = role === "admin" || (role === "premium" && untilValid)
    const isTrialActive = role === "free" && untilValid
    const trialExpired = role === "free" && !!until && !untilValid

    // Acceso a predicciones 2 cifras: trial activo, premium, admin, O trial expirado (modo limitado)
    const canAccess2Cifras = isPremiumRole || isTrialActive || trialExpired
    // 3/4 cifras + redoblona SOLO premium/admin (NO durante trial free, NO trial expirado)
    const canAccessPremiumFeatures = isPremiumRole

    const predictionsUsed = await countUserPredictions(user.id)
    const predictionsRemaining = isPremiumRole
      ? Number.POSITIVE_INFINITY
      : trialExpired
        ? FREE_MAX_PREDICTIONS  // Expired trial gets full 10 predictions of 2 cifras
        : Math.max(0, FREE_MAX_PREDICTIONS - predictionsUsed)

    const canSavePrediction =
      canAccess2Cifras && (isPremiumRole || predictionsRemaining > 0)

    let daysRemaining: number | null = null
    if (until) {
      daysRemaining = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000))
    }

    return {
      userId: user.id,
      email: user.email || null,
      role,
      isPremium: isPremiumRole,
      isTrialActive,
      trialExpired,
      canAccess2Cifras,
      canAccessPremiumFeatures,
      canSavePrediction,
      predictionsUsed,
      predictionsRemaining: isPremiumRole ? -1 : predictionsRemaining,
      premium_until: profile?.premium_until || null,
      daysRemaining,
    }
  } catch {
    return emptyTier()
  }
}
