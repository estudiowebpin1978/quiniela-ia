import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Rutas que requieren autenticación
const PROTECTED_API = ["/api/predictions", "/api/auth/me"];
const PROTECTED_PAGES = ["/predictions"];
const PUBLIC_ROUTES = ["/login", "/register", "/api/webhooks", "/api/cron"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Dejar pasar rutas públicas sin verificación
  if (PUBLIC_ROUTES.some((r) => pathname.startsWith(r))) {
    return NextResponse.next();
  }

  // ── Proteger rutas /api/* ──────────────────────────────────────────────────
  const isProtectedApi = PROTECTED_API.some((r) => pathname.startsWith(r));
  if (isProtectedApi) {
    // Extraer token del header Authorization: Bearer <token>
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : null;

    if (!token) {
      return NextResponse.json(
        { error: "No autorizado. Token requerido." },
        { status: 401 }
      );
    }

    // Verificar token con Supabase
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => [],
          setAll: () => {},
        },
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
      }
    );

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json(
        { error: "Token inválido o expirado." },
        { status: 401 }
      );
    }

    // Pasar el user_id al handler para evitar re-verificar
    const headers = new Headers(req.headers);
    headers.set("x-user-id", user.id);
    headers.set("x-user-email", user.email ?? "");
    return NextResponse.next({ request: { headers } });
  }

  // ── Proteger páginas privadas ─────────────────────────────────────────────
  const isProtectedPage = PROTECTED_PAGES.some((r) =>
    pathname.startsWith(r)
  );
  if (isProtectedPage) {
    // Para páginas usamos la cookie de sesión de Supabase
    const res = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () =>
            req.cookies.getAll().map(({ name, value }) => ({ name, value })),
          setAll: (cookiesToSet) => {
            cookiesToSet.forEach(({ name, value, options }) =>
              res.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Aplicar a todo excepto archivos estáticos y Next internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
