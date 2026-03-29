import { NextRequest } from "next/server"

/** Verifica JWT de Supabase y perfil premium/admin (misma lógica que /api/auth/me). */
export async function isPremiumUser(req: NextRequest): Promise<boolean> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") ?? ""
  if (!token) return false
  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g, "").trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g, "").trim()
  if (!SB_URL || !SB_KEY) return false
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    })
    if (!userRes.ok) return false
    const user = await userRes.json()
    const profRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`,
      { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(5000) }
    )
    if (!profRes.ok) return false
    const profiles = await profRes.json()
    const profile = profiles?.[0]
    return (
      profile?.role === "admin" ||
      (profile?.role === "premium" && profile?.premium_until && new Date(profile.premium_until) > new Date())
    )
  } catch {
    return false
  }
}
