import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { calcularAciertos } from "../../lib/calculo";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const { data: preds } = await supabase
    .from("predicciones")
    .select("*")
    .eq("estado", "pendiente");

  const { data: resultados } = await supabase
    .from("resultados")
    .select("*");

  for (const pred of preds || []) {
    const resultado = resultados?.find(
      (r) =>
        new Date(r.fecha).toISOString().split("T")[0] ===
          new Date(pred.fecha).toISOString().split("T")[0] &&
        r.turno === pred.turno
    );

    if (!resultado) continue;

    const aciertos = calcularAciertos(pred, resultado.numeros);

    await supabase
      .from("predicciones")
      .update({
        estado:
          aciertos.n2 || aciertos.n3 || aciertos.n4
            ? "acertado"
            : "fallado",
        aciertos_2: aciertos.n2,
        aciertos_3: aciertos.n3,
        aciertos_4: aciertos.n4,
      })
      .eq("id", pred.id);
  }

  res.json({ ok: true });
}