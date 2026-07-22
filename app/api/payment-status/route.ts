import { NextRequest, NextResponse } from "next/server"

const SB_URL = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SB_KEY = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = req.headers.get("authorization")?.replace("Bearer ", "")

  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 401 })
  }

  try {
    // Verify JWT
    const userRes = await fetch(`${SB_URL()}/auth/v1/user`, {
      headers: { "apikey": SB_KEY(), Authorization: `Bearer ${token}` },
    })

    if (!userRes.ok) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 })
    }

    const user = await userRes.json()

    // Get profile
    const profRes = await fetch(
      `${SB_URL()}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`,
      { headers: { "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}` } }
    )

    const profiles = await profRes.json()
    const profile = profiles?.[0]

    if (!profile) {
      // Create profile if missing with 30-day trial
      const trialUntil = new Date(Date.now() + 30 * 86400000).toISOString();
      await fetch(`${SB_URL()}/rest/v1/user_profiles`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY(), Authorization: `Bearer ${SB_KEY()}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({ id: user.id, email: user.email || "", role: "free", premium_until: trialUntil }),
      });
      return NextResponse.json({ isPremium: true, role: "free", premium_until: trialUntil, daysRemaining: 30 });
    }

    const adminEmails = ["estudiowebpin@gmail.com"];
    const isAdmin = adminEmails.includes(user.email?.toLowerCase?.() || user.email);
    const dbRole = profile?.role ?? "free";
    const role = isAdmin ? "admin" : (dbRole === "admin" ? "free" : dbRole);

    const isPremium =
      role === "admin" ||
      (role === "premium" &&
        profile?.premium_until &&
        new Date(profile.premium_until) > new Date()) ||
      (role === "free" &&
        profile?.premium_until &&
        new Date(profile.premium_until) > new Date())

    let daysRemaining = null
    if (profile?.premium_until) {
      daysRemaining = Math.ceil(
        (new Date(profile.premium_until).getTime() - Date.now()) / 86400000
      )
      if (daysRemaining < 0) daysRemaining = 0
    }

    const trialExpired = role === "free" && profile?.premium_until && new Date(profile.premium_until) <= new Date()

    return NextResponse.json({
      isPremium,
      role,
      premium_until: profile?.premium_until || null,
      daysRemaining,
      trialExpired: !!trialExpired,
    })
  } catch {
    return NextResponse.json({ isPremium: false, role: "free" })
  }
}
