import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string
);

export async function GET() {
  const hoy = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("quiniela_nacional")
    .select("*")
    .eq("fecha", hoy);

  return Response.json(data);
}