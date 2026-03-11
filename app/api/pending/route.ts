import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20"), 100);
  const sorteo = searchParams.get("sorteo");

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("draws")
      .select("draw_date,sorteo,pos_1,pos_2,pos_3,pos_4,pos_5,pos_6,pos_7,pos_8,pos_9,pos_10")
      .order("draw_date", { ascending: false })
      .limit(limit);
    if (sorteo && sorteo !== "Todos") query = query.eq("sorteo", sorteo);

    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ draws: data ?? [], count: data?.length ?? 0 });
  } catch (err) {
    console.error("[/api/pending]", err);
    return NextResponse.json({ draws: [], error: "Error al obtener sorteos" }, { status: 500 });
  }
}
