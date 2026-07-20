import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ","");
  if (!token) return NextResponse.json({ isPremium: false, role: "free" });

  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim();
  if (!SB_URL || !SB_KEY) return NextResponse.json({ isPremium: false, role: "free" });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    // Verify JWT
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!userRes.ok) return NextResponse.json({ isPremium: false, role: "free" });
    const user = await userRes.json();

    // Get profile
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 5000);
    const profRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`,
      { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }, signal: controller2.signal }
    );
    clearTimeout(timeout2);

    if (!profRes.ok) {
      // Profile doesn't exist — create with 30-day trial
      const trialUntil = new Date(Date.now() + 30 * 86400000).toISOString();
      await fetch(`${SB_URL}/rest/v1/user_profiles`, {
        method: "POST",
        headers: {
          "apikey": SB_KEY, Authorization: `Bearer ${SB_KEY}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({ id: user.id, email: user.email, role: "free", premium_until: trialUntil }),
      });
      return NextResponse.json({ isPremium: true, role: "free", email: user.email, userId: user.id, premium_until: trialUntil, daysRemaining: 30 });
    }
    const profiles = await profRes.json();
    const profile = profiles?.[0];

    let daysRemaining = null
    if (profile?.premium_until) {
      daysRemaining = Math.ceil((new Date(profile.premium_until).getTime() - Date.now()) / 86400000)
      if (daysRemaining < 0) daysRemaining = 0
    }

    // Admin role is ONLY for estudiowebpin@gmail.com — hardcode check
    const adminEmails = ["estudiowebpin@gmail.com"];
    const isAdmin = adminEmails.includes(user.email?.toLowerCase?.() || user.email);
    const dbRole = profile?.role ?? "free";
    // If DB has "admin" but email doesn't match, downgrade to "free"
    const role = isAdmin ? "admin" : (dbRole === "admin" ? "free" : dbRole);

    const isPremium = role === "admin" ||
      (role === "premium" && profile?.premium_until && new Date(profile.premium_until) > new Date()) ||
      (role === "free" && profile?.premium_until && new Date(profile.premium_until) > new Date());

    const trialExpired = role === "free" && profile?.premium_until && new Date(profile.premium_until) <= new Date();

    return NextResponse.json({
      isPremium, role, email: user.email, userId: user.id,
      premium_until: profile?.premium_until || null, daysRemaining,
      trialExpired: !!trialExpired
    });

  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ isPremium: false, role: "free" });
  }
}