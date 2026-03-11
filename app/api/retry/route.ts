import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { count } = await supabase.from("draws").select("*", { count: "exact", head: true });
  return NextResponse.json({ ok: true, draws: count ?? 0 });
}
