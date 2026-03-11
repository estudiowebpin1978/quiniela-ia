import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function middleware(req: NextRequest) {
  // Solo proteger rutas que requieren auth
  const protectedPaths = ["/dashboard"];
  const path = req.nextUrl.pathname;
  if (!protectedPaths.some((p) => path.startsWith(p))) {
    return NextResponse.next();
  }

  // Verificar sesión via cookie
  const token = req.cookies.get("sb-access-token")?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/dashboard/:path*"] };
