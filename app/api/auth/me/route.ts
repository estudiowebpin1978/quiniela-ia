import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Retorna perfil del usuario autenticado (incluyendo rol premium)
// Usa service_role para bypassear RLS — solo accesible server-side
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  if (!token) {
    return NextResponse.json({ error: "No token" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Verificar el token JWT con Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    // Obtener perfil con rol premium
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("id,email,role,premium_until")
      .eq("id", user.id)
      .single();

    const isPremium =
      profile?.role === "admin" ||
      (profile?.role === "premium" &&
        profile?.premium_until &&
        new Date(profile.premium_until) > new Date());

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: profile?.role ?? "free",
      isPremium: isPremium ?? false,
      premium_until: profile?.premium_until ?? null,
    });
  } catch (err) {
    console.error("[/api/auth/me]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
