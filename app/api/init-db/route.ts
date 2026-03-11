import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { count, error } = await supabase.from("draws").select("*", { count: "exact", head: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, draws: count ?? 0, message: "DB conectada correctamente" });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
