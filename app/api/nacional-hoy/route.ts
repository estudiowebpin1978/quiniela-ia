import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: "Supabase configuration missing" }, { status: 500 });
  }
  
  const supabase = createClient(supabaseUrl, supabaseKey);
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
