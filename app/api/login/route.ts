import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase-client";
import { ensureUserProfile } from "@/lib/auth/tier";

export async function POST(req: NextRequest) {
  const supabase = getSupabase();

  let email: string, password: string, action: string;
  try {
    const body = await req.json();
    email = body.email;
    password = body.password;
    action = body.action;
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!email || !password) return NextResponse.json({ error: "Faltan campos." }, { status: 400 });

  try {
    if (action === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        let msg = error.message;
        if (msg.includes("already registered")) msg = "Email ya registrado. Iniciá sesión.";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      if (data.user?.id) await ensureUserProfile(data.user.id, email);
      return NextResponse.json({
        access_token: data.session?.access_token ?? null,
        refresh_token: data.session?.refresh_token ?? null,
        expires_in: data.session?.expires_in ?? 3600,
        user: { id: data.user?.id, email: data.user?.email },
        needsConfirmation: !data.session?.access_token,
      });
    }

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      let msg = error.message;
      if (msg.includes("Invalid login")) msg = "Email o contraseña incorrectos.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    if (data.user?.id) await ensureUserProfile(data.user.id, email);

    const payload = JSON.parse(Buffer.from(data.session.access_token.split(".")[1], "base64").toString());
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
      expires_at: payload.exp,
      user: { id: data.user?.id, email: data.user?.email },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 500 });
  }
}
