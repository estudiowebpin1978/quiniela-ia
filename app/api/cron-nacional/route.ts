import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";
const URL = "https://www.ruta1000.com.ar/index2008.php?Resultado=Quiniela_Nacional_Sorteos_Anteriores";
const URL2 = "https://quiniela-nacional.com/quinielanacional/";
const HORAS_VALIDAS = [10, 12, 15, 18, 21];

async function insertLog(source: string, status: "success" | "failed" | "skipped", recordsInserted: number, errorMessage?: string | null, metadata?: any) {
  if (!SB || !SK) return;
  try {
    await fetch(`${SB}/rest/v1/sync_logs`, {
      method: "POST",
      headers: {
        "apikey": SK,
        "Authorization": `Bearer ${SK}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        source,
        status,
        records_inserted: recordsInserted,
        error_message: errorMessage || null,
        metadata
      })
    });
  } catch (e) { console.log("Log error:", e); }
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  const secret = req.nextUrl.searchParams.get("secret");
  const dateParam = req.nextUrl.searchParams.get("date");
  const force = req.nextUrl.searchParams.get("force") === "1";
  
  const ahora = new Date();
  const hora = ahora.getHours();
  const fecha = dateParam || ahora.toISOString().split("T")[0];
  
  if (!dateParam && !force && !HORAS_VALIDAS.includes(hora)) {
    return NextResponse.json({ skip: true, hora, reason: "fuera de horario" });
  }

  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
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
      if (cells.length < 21) return;
      
      const cell0 = cells.eq(0).text();
      if (!cell0.includes("/") || cell0.includes("Fecha") || cell0.includes("VIERNES")) return;
      
      const fechaMatch = cell0.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!fechaMatch || cells.length < 21) return;
      
      const day = fechaMatch[1];
      const month = fechaMatch[2];
      const year = fechaMatch[3];
      const fechaStr = `${year}-${month}-${day}`;
      
      const horaMatch = cell0.match(/(\d{2}):(\d{2})/);
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
      await insertLog("cron-nacional", "skipped", 0, "No se encontraron sorteos");
      return NextResponse.json({ ok: false, msg: "No se encontraron sorteos" });
    }

    if (!SB || !SK) {
      await insertLog("cron-nacional", "failed", 0, "Supabase no configurado");
      return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
    }

    // Get unique dates from scraped data
    const uniqueDates = [...new Set(Object.values(sorteos).map(s => s.fecha))];
    
    // For each date, insert all its turnos
    let guardados = 0;
    let totalTurnos = 0;
    const resultsByDate: Record<string, number> = {};
    
    for (const fechaActual of uniqueDates) {
      const fechaObj: Record<string, { fecha: string; turno: string; numeros: string[] }> = {};
      
      // Collect all turnos for this date
      for (const key of keys) {
        const s = sorteos[key];
        if (s.fecha === fechaActual) {
          fechaObj[s.turno] = s;
        }
      }
      
      // Insert each turno for this date
      for (const [, s] of Object.entries(fechaObj)) {
        const res = await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: {
            "apikey": SK,
            "Authorization": `Bearer ${SK}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
          },
          body: JSON.stringify({
            date: s.fecha,
            turno: s.turno,
            numbers: s.numeros.map((n: string) => parseInt(n)),
            source: "scraper"
          })
        });
        if (res.status === 201 || res.status === 200) guardados++;
        totalTurnos++;
      }
      resultsByDate[fechaActual] = Object.keys(fechaObj).length;
    }

    const execTime = Date.now() - startTime;
    await insertLog("cron-nacional", "success", guardados, null, { uniqueDates, resultsByDate, execution_time_ms: execTime });

    return NextResponse.json({
      ok: true,
      guardados,
      fechasProcesadas: uniqueDates,
      resultadosPorFecha: resultsByDate,
      totalSorteos: keys.length,
    });

  } catch (error: unknown) {
    const err = error as { name?: string; message?: string };
    await insertLog("cron-nacional", "failed", 0, err.message);
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}