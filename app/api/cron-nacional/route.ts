import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null;

const URL = "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores";
const HORAS_VALIDAS = [10, 12, 15, 18, 21];

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const dateParam = req.nextUrl.searchParams.get("date");
  
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const ahora = new Date();
    const hora = ahora.getHours();
    
    const fecha = dateParam || ahora.toISOString().split("T")[0];
    
    const force = req.nextUrl.searchParams.get("force") === "1";
    if (!dateParam && !force && !HORAS_VALIDAS.includes(hora)) {
      return NextResponse.json({ skip: true, hora, reason: "fuera de horario" });
    }

    console.log("Scraping:", URL);
    
    const { data } = await axios.get(URL, {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
      },
      timeout: 30000,
    });

    const $ = cheerio.load(data);
    const sorteos: Record<string, { fecha: string; turno: string; numeros: string[] }> = {};

    $("tr").each((_: number, tr: cheerio.Element) => {
      const cells = $(tr).find("td");
      if (cells.length < 22) return;
      
      const text = $(cells.eq(0)).text();
      if (!text.includes("/") || text.includes("Fecha")) return;
      
      const fechaMatch = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!fechaMatch || cells.length < 21) return;
      
      const day = fechaMatch[1];
      const month = fechaMatch[2];
      const year = fechaMatch[3];
      const fechaStr = `${year}-${month}-${day}`;
      
      const horaMatch = text.match(/(\d{2}):(\d{2})/);
      if (!horaMatch) return;
      
      const hora = parseInt(horaMatch[1]);
      let turno = "";
      if (hora === 10) turno = "previa";
      else if (hora === 12) turno = "primera";
      else if (hora === 15) turno = "matutina";
      else if (hora === 18) turno = "vespertina";
      else if (hora === 21) turno = "nocturna";
      else return;
      
      const numeros: string[] = [];
      for (let i = 1; i <= 20; i++) {
        const num = $(cells.eq(i)).text().trim();
        if (/^\d{4}$/.test(num)) {
          numeros.push(num);
        }
      }
      
      if (numeros.length === 20 && turno) {
        const key = `${fechaStr}-${turno}`;
        if (!sorteos[key]) {
          sorteos[key] = { fecha: fechaStr, turno, numeros };
        }
      }
    });

    const keys = Object.keys(sorteos);
    if (keys.length === 0) {
      return NextResponse.json({ 
        ok: false, 
        msg: "No se encontraron sorteos",
      });
    }

    let guardados = 0;
    if (!supabase) {
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    }

    const fechaObj: Record<string, { fecha: string; turno: string; numeros: string[] }> = {};
    for (const key of keys) {
      const s = sorteos[key];
      if (s.fecha === fecha) {
        fechaObj[s.turno] = s;
      }
    }

    if (dateParam) {
      for (const [, s] of Object.entries(fechaObj)) {
        const { error } = await supabase
          .from("draws")
          .upsert({
            date: s.fecha,
            turno: s.turno,
            numbers: s.numeros.map((n: string) => parseInt(n)),
            source: "scraper",
          }, {
            onConflict: "date,turno",
          });

        if (!error) guardados++;
      }
    } else {
      for (const [turno, s] of Object.entries(fechaObj)) {
        const { error } = await supabase
          .from("draws")
          .upsert({
            date: s.fecha,
            turno,
            numbers: s.numeros.map((n: string) => parseInt(n)),
            source: "scraper",
          }, {
            onConflict: "date,turno",
          });

        if (!error) guardados++;
      }
    }

    return NextResponse.json({
      ok: true,
      guardados,
      turnos: Object.keys(fechaObj),
      fecha,
      totalSorteos: keys.length,
    });

  } catch (error: any) {
    console.error("Error:", error.message);
    return NextResponse.json({
      ok: false,
      error: error.message,
    }, { status: 500 });
  }
}