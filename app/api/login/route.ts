import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import logger from "@/lib/logger";

function getSupabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim();
}
function getSupabaseAnonKey() {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").replace(/"/g, "").trim();
}

export async function POST(req: NextRequest) {
  const start = Date.now();
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();

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

  // Create a FRESH client per request (no stale singleton connections)
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
      }
    }
  });

  try {
    if (action === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        let msg = error.message;
        if (msg.includes("already registered")) msg = "Email ya registrado. Iniciá sesión.";
        return NextResponse.json({ error: msg }, { status: 400 });
      }
      logger.info(`[login] signup OK ${Date.now() - start}ms`);
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

    const payload = JSON.parse(Buffer.from(data.session.access_token.split(".")[1], "base64").toString());
    logger.info(`[login] signin OK ${Date.now() - start}ms`);
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in ?? 3600,
      expires_at: payload.exp,
      user: { id: data.user?.id, email: data.user?.email },
    });
  } catch (e: unknown) {
    const elapsed = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    logger.error(`[login] error ${elapsed}ms`, { error: msg });
    if (msg.includes("abort") || msg.includes("timeout") || elapsed > 7000) {
      return NextResponse.json({ error: "Servicio temporalmente lento. Intentá de nuevo." }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
