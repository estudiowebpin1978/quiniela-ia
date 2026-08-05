import { NextRequest, NextResponse } from "next/server";

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // --- API route protection ---
  if (pathname.startsWith("/api/")) {
    const secretParam = req.nextUrl.searchParams.get("secret");
    if (secretParam) {
      const hasAuth = !!req.headers.get("authorization");
      const isVercelCron = req.headers.get("x-vercel-cron") === "1";
      const hasXCronSecret = !!req.headers.get("x-cron-secret");
      const matchesCronSecret = process.env.CRON_SECRET && secretParam === (process.env.CRON_SECRET || "").replace(/^Bearer\s+/i, "");

      if (!hasAuth && !isVercelCron && !hasXCronSecret && !matchesCronSecret) {
        return NextResponse.json(
          { error: "Secret must be sent via Authorization header" },
          { status: 401 }
        );
      }
    }

    const segments = pathname.split("/");
    for (const seg of segments) {
      if (seg.length === 36 && seg.includes("-") && !isUuid(seg)) {
        return NextResponse.json({ error: "Invalid ID format" }, { status: 400 });
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
  ],
};
