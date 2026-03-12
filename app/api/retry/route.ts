import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Reintenta insertar sorteos pendientes que fallaron
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("pending_draws")
      .select("*")
      .eq("status", "error")
      .lt("retries", 3)
      .limit(10);

    if (error) throw error;

    let retried = 0;
    for (const pending of data ?? []) {
      await supabase
        .from("pending_draws")
        .update({ status: "pending", retries: pending.retries + 1, updated_at: new Date().toISOString() })
        .eq("id", pending.id);
      retried++;
    }

    return NextResponse.json({ retried, message: `${retried} sorteos puestos en cola para reintento` });
  } catch (err) {
    console.error("[/api/retry]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ message: "Usar POST para reintentar sorteos fallidos" });
}
