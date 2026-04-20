import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const URL =
  "https://quinielanacional1.com.ar";

const HORAS_VALIDAS = [10, 12, 15, 18, 21];

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const dateParam = req.nextUrl.searchParams.get("date");

  // Debug: registrar qué llega
  console.log("secret:", secret ? "presente" : "ausente");
  console.log("dateParam:", dateParam);
  console.log("CRON_SECRET env:", process.env.CRON_SECRET ? "configurado" : "NO CONFIGURADO");

  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();
    
    // Determinar la fecha a usar
    let fecha: string;
    if (dateParam) {
      fecha = dateParam;  // Fecha proporcionada (para backfill)
    } else {
      fecha = ahora.toISOString().split("T")[0];  // Fecha actual
    }

    // Si se proporciona fecha, ejecutar SIEMPRE (para backfill)
    // Si NO se proporciona fecha, solo ejecutar en horarios de sorteo
    const hora = ahora.getHours();
    console.log("hora actual:", hora, "dateParam:", dateParam);
    
    if (!dateParam && !HORAS_VALIDAS.includes(hora)) {
      console.log("Saliendo por horario");
      return NextResponse.json({ 
        skip: true, 
        hora,
        debug: { 
          dateParam: dateParam || "null/empty", 
          hora: hora,
          HORAS_VALIDAS: HORAS_VALIDAS,
          condicion: "!dateParam=" + (!dateParam) + " && !HORAS_VALIDAS.includes(hora)=" + (!HORAS_VALIDAS.includes(hora))
        }
      });
    }
    
    console.log("Ejecutando scraping...");

    // Determinar la URL a scrapear
    // Si se proporciona fecha, usar el formato con fecha (para backfill)
    // Si no, usar la URL base (para scrapeo automático del día actual)
    let scrapeUrl = URL;
    if (dateParam) {
      const parts = dateParam.split('-');
      if (parts.length === 3) {
        const day = parts[2];
        const month = parts[1];
        const yearShort = parts[0].slice(-2);
        scrapeUrl = `${URL}/${day}-${month}-${yearShort}`;
      }
    }

    const { data } = await axios.get(scrapeUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const sorteos: Record<string, any[]> = {};

    $("h2, h3").each((_: number, el: cheerio.Element) => {
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

        tabla.find("tbody tr").each((_: number, row: cheerio.Element) => {
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
      return NextResponse.json({ ok: false, msg: "sin datos" });
    }

    let guardados = 0;

    if (!supabase) {
      return NextResponse.json({ error: "Configuración de base de datos incompleta" }, { status: 500 });
    }

    for (const [sorteo, resultadosRaw] of Object.entries(sorteos)) {
      const resultados = resultadosRaw as any[];
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

    return NextResponse.json({
      ok: true,
      guardados,
      sorteos: Object.keys(sorteos),
      hora,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}