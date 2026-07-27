import { getSupabase } from "@/lib/supabase-client";

export async function GET() {
  const supabase = getSupabase();
  const hoy = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("draws")
    .select("*")
    .eq("date", hoy);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}
