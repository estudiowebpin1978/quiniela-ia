import { getSupabase } from "@/lib/supabase-client";
import { JURIS_QUINIELA_CIUDAD } from "@/lib/procedencia";

export async function GET() {
  const supabase = getSupabase();
  const hoy = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("draws")
    .select("*")
    .eq("date", hoy)
    .in("jurisdiccion", JURIS_QUINIELA_CIUDAD);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
