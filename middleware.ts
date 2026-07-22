import { NextRequest, NextResponse } from "next/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const res = NextResponse.next();

  // --- Security headers ---
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");

  // CSP — permissive enough for inline styles/scripts used by Next.js
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co https://*.vercel.app; " +
    "frame-ancestors 'none'"
  );

  // --- API route protection ---
  if (pathname.startsWith("/api/")) {
    // Block secret in query param when there's no other auth header
    // Exception: if the secret matches CRON_SECRET, allow through (route handlers validate themselves)
    const secretParam = req.nextUrl.searchParams.get("secret");
    if (secretParam) {
      const hasAuth = !!req.headers.get("authorization");
      const isVercelCron = req.headers.get("x-vercel-cron") === "1";
      const hasXCronSecret = !!req.headers.get("x-cron-secret");
      const matchesCronSecret = process.env.CRON_SECRET && secretParam === process.env.CRON_SECRET;

      if (!hasAuth && !isVercelCron && !hasXCronSecret && !matchesCronSecret) {
        return NextResponse.json(
          { error: "Secret must be sent via Authorization header" },
          { status: 401 }
        );
      }
    }

    // Validate UUID format on common path params
    const segments = pathname.split("/");
    for (const seg of segments) {
      if (seg.length === 36 && seg.includes("-") && !isUuid(seg)) {
        return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
      }
    }
  }

  // --- Page route auth enforcement ---
  // Admin page requires server-side token verification
  if (pathname.startsWith("/admin")) {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/api/:path*",
    "/predictions",
    "/admin",
    "/login",
    "/eliminar-cuenta",
  ],
};
