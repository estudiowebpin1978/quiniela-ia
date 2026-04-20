import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "NOT SET",
    SUPABASE_URL: process.env.SUPABASE_URL ? "SET" : "NOT SET",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET",
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY ? "SET" : "NOT SET",
    CRON_SECRET: process.env.CRON_SECRET ? "SET" : "NOT SET",
    GROQ_API_KEY: process.env.GROQ_API_KEY ? "SET" : "NOT SET",
    vercelEnv: process.env.VERCEL_ENV,
    vercelBranch: process.env.VERCEL_GIT_COMMIT_REF,
  });
}