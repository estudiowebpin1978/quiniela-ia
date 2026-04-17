import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { email, comprobante_url } = req.body;

  const { error } = await supabase.from("suscripciones").insert({
    email,
    estado: "pending",
    comprobante_url,
  });

  if (error) return res.status(500).json({ error });

  res.status(200).json({ ok: true });
}