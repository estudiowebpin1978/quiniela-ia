import { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const fecha = new Date().toISOString().split("T")[0];

  // acá integrás scraping real (fetch + cheerio)

  const turno = "Nocturna";
  const numeros = ["1234","5678"]; // ejemplo

  await supabase
    .from("resultados")
    .upsert({
      fecha,
      turno,
      numeros
    });

  res.json({ ok: true });
}