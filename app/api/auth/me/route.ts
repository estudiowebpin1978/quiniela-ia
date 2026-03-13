import { NextRequest, NextResponse } from "next/server";
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ","");
  if (!token) return NextResponse.json({ isPremium: false, role: "free" });
  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g,"").trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g,"").trim();
  if (!SB_URL || !SB_KEY) return NextResponse.json({ isPremium: false, role: "free" });
  const c = new AbortController();
  setTimeout(() => c.abort(), 5000);
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` }, signal: c.signal });
    if (!r.ok) return NextResponse.json({ isPremium: false, role: "free" });
    const user = await r.json();
    const c2 = new AbortController();
    setTimeout(() => c2.abort(), 5000);
    const pr = await fetch(`${SB_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`, { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }, signal: c2.signal });
    const profiles = pr.ok ? await pr.json() : [];
    const p = profiles?.[0];
    const isPremium = p?.role === "admin" || (p?.role === "premium" && p?.premium_until && new Date(p.premium_until) > new Date());
    return NextResponse.json({ isPremium, role: p?.role ?? "free", email: user.email });
  } catch { return NextResponse.json({ isPremium: false, role: "free" }); }
}
