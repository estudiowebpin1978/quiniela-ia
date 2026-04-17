export async function GET() {
  const hoy = new Date().toISOString().split("T")[0];

  const { data } = await supabase
    .from("quiniela_nacional")
    .select("*")
    .eq("fecha", hoy);

  return Response.json(data);
}