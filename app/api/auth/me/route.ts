import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ","");
  if (!token) return NextResponse.json({ isPremium: false, role: "free" });

  const SB_URL = $env:Next_Public_Supabase_Url;
  const SB_KEY = $env:Supabase_Service_Key;
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

    if (!profRes.ok) return NextResponse.json({ isPremium: false, role: "free", email: user.email });
    const profiles = await profRes.json();
    const profile = profiles?.[0];

    const isPremium = profile?.role === "admin" ||
      (profile?.role === "premium" && profile?.premium_until && new Date(profile.premium_until) > new Date());

    return NextResponse.json({ isPremium, role: profile?.role ?? "free", email: user.email });

  } catch {
    clearTimeout(timeout);
    return NextResponse.json({ isPremium: false, role: "free" });
  }
}
