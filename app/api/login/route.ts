import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const SB_URL  = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g, "").trim();
  const SB_ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").replace(/"/g, "").trim();

  if (!SB_URL || !SB_ANON) return NextResponse.json({ error: "Variables no configuradas." }, { status: 500 });

  const { email, password, action } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Faltan campos." }, { status: 400 });

  const endpoint = action === "signup"
    ? `${SB_URL}/auth/v1/signup`
    : `${SB_URL}/auth/v1/token?grant_type=password`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": SB_ANON },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await res.json();
    if (!res.ok) {
      const raw = data?.error_description ?? data?.msg ?? data?.message ?? "Error";
      let msg = raw;
      if (raw.includes("Invalid login")) msg = "Email o contrasena incorrectos.";
      else if (raw.includes("not confirmed")) msg = "Confirma tu email primero.";
      else if (raw.includes("already registered")) msg = "Email ya registrado. Inicia sesion.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in ?? 3600,
      user: { id: data.user?.id, email: data.user?.email },
      needsConfirmation: !data.access_token && action === "signup",
    });
  } catch (e: unknown) {
    clearTimeout(timeout);
    if ((e as Error)?.name === "AbortError") return NextResponse.json({ error: "Supabase no responde." }, { status: 503 });
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
