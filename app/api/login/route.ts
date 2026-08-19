import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";

function getEnv(key: string): string {
  return (process.env[key] || "").replace(/"/g, "").trim();
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

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

  // Fresh client per request, NO custom fetch wrapper
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    let result: { data: unknown; error: { message: string } | null };

    if (action === "signup") {
      result = await supabase.auth.signUp({ email, password });
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    const { error } = result;
    if (error) {
      let msg = error.message;
      if (msg.includes("already registered")) msg = "Email ya registrado. Iniciá sesión.";
      if (msg.includes("Invalid login")) msg = "Email o contraseña incorrectos.";
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const data = result.data as { session?: { access_token: string; refresh_token: string; expires_in: number }; user?: { id: string; email?: string } };

    if (action === "signup") {
      logger.info(`[login] signup OK ${Date.now() - start}ms`);
      return NextResponse.json({
        access_token: data.session?.access_token ?? null,
        refresh_token: data.session?.refresh_token ?? null,
        expires_in: data.session?.expires_in ?? 3600,
        user: { id: data.user?.id, email: data.user?.email },
        needsConfirmation: !data.session?.access_token,
      });
    }

    const payload = JSON.parse(Buffer.from(data.session!.access_token.split(".")[1], "base64").toString());
    logger.info(`[login] signin OK ${Date.now() - start}ms`);
    return NextResponse.json({
      access_token: data.session!.access_token,
      refresh_token: data.session!.refresh_token,
      expires_in: data.session!.expires_in ?? 3600,
      expires_at: payload.exp,
      user: { id: data.user?.id, email: data.user?.email },
    });
  } catch (e: unknown) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[login] error ${elapsed}ms`, { error: msg });
    return NextResponse.json({ error: "Error de conexión. Intentá de nuevo." }, { status: 503 });
  }
}
