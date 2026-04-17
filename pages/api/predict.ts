import type { NextApiRequest, NextApiResponse } from "next";
import { createClient } from "@supabase/supabase-js";
import { generarPredicciones } from "../../lib/prediccion";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // 1. Obtener resultados
    const { data: resultados } = await supabase
      .from("resultados")
      .select("*")
      .order("fecha", { ascending: false })
      .limit(300);

    if (!resultados) return res.status(500).json({ error: "Sin datos" });

    // 2. Construir estadísticas
    const stats: Record<string, any> = {};

    let index = 0;

    for (const r of resultados) {
      for (const num of r.numeros) {
        if (!stats[num]) {
          stats[num] = {
            frecuencia: 0,
            atraso: index,
            tendencia: 0
          };
        }

        stats[num].frecuencia++;

        if (index < 20) {
          stats[num].tendencia++;
        }
      }
      index++;
    }

    // 3. Generar predicción
    const pred = generarPredicciones(stats);

    // 4. Guardar en DB
    const hoy = new Date().toISOString().split("T")[0];
    const turno = "Nocturna"; // podés automatizar luego

    await supabase.from("predicciones").insert({
      fecha: hoy,
      turno,
      numeros_2: pred.numeros_2,
      numeros_3: pred.numeros_3,
      numeros_4: pred.numeros_4,
      redoblona: pred.redoblona,
      estado: "pendiente"
    });

    res.json({ ok: true, pred });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}