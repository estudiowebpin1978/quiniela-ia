import axios from "axios";
import cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_KEY!
);

const URL =
  "https://www.loteria-nacional.gov.ar/resultados/quiniela-nacional";

const HORAS_VALIDAS = [10, 12, 15, 18, 21];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();
    const hora = ahora.getHours();

    // 🧠 Evita ejecuciones innecesarias
    if (!HORAS_VALIDAS.includes(hora)) {
      return Response.json({ skip: true, hora });
    }

    const { data } = await axios.get(URL, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const sorteos: any = {};

    $("h2, h3").each((_, el) => {
      const nombre = $(el).text().toLowerCase();

      if (
        nombre.includes("previa") ||
        nombre.includes("primera") ||
        nombre.includes("matutina") ||
        nombre.includes("vespertina") ||
        nombre.includes("nocturna")
      ) {
        const tabla = $(el).next("table");
        const resultados: any[] = [];

        tabla.find("tbody tr").each((_, row) => {
          const puesto = $(row).find("td").eq(0).text().trim();
          const numero = $(row).find("td").eq(1).text().trim();

          if (puesto && numero) {
            resultados.push({ puesto, numero });
          }
        });

        if (resultados.length > 0) {
          sorteos[nombre] = resultados;
        }
      }
    });

    if (Object.keys(sorteos).length === 0) {
      return Response.json({ ok: false, msg: "sin datos" });
    }

    const fecha = ahora.toISOString().split("T")[0];
    let guardados = 0;

    for (const [sorteo, resultados] of Object.entries(sorteos)) {
      // 🛑 FILTRO CLAVE
      if (resultados.length < 20) {
        console.log(`⚠️ ${sorteo} incompleto (${resultados.length})`);
        continue;
      }

      const { error } = await supabase
        .from("quiniela_nacional")
        .upsert(
          {
            fecha,
            sorteo,
            resultados,
            updated_at: new Date(),
          },
          {
            onConflict: "fecha,sorteo",
          }
        );

      if (!error) guardados++;
    }

    return Response.json({
      ok: true,
      guardados,
      sorteos: Object.keys(sorteos),
      hora,
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}