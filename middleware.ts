import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Rutas públicas - no requieren auth
  const publicPaths = ["/login", "/register", "/api"];
  if (publicPaths.some(p => path.startsWith(p))) return NextResponse.next();

  // Supabase guarda la sesión en cookies con prefijo "sb-"
  // Compatible con @supabase/supabase-js v2 y @supabase/ssr
  const cookies = req.cookies.getAll();
  const hasSession = cookies.some(c =>
    c.name.startsWith("sb-") &&
    (c.name.endsWith("-auth-token") || c.name.endsWith("-access-token"))
  );

  if (!hasSession) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
