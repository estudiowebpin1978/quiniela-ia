import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.ruta1000.com.ar";
const SOURCE_NAME = "ruta1000-v5";

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];

const DAYS_MAP: Record<string, string> = {
  "Monday": "Lunes",
  "Tuesday": "Martes",
  "Wednesday": "Miercoles",
  "Thursday": "Jueves",
  "Friday": "Viernes",
  "Saturday": "Sabado",
  "Sunday": "Domingo",
};

const MONTH_MAP: Record<string, string> = {
  "Enero": "01",
  "Febrero": "02",
  "Marzo": "03",
  "Abril": "04",
  "Mayo": "05",
  "Junio": "06",
  "Julio": "07",
  "Agosto": "08",
  "Septiembre": "09",
  "Octubre": "10",
  "Noviembre": "11",
  "Diciembre": "12",
};

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDayName(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "60");

  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  try {
    let guardados = 0;
    let saltados = 0;
    let errores = 0;
    const resultsByDate: Record<string, number> = {};
    const allDates: string[] = [];

    for (let i = 0; i < days; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const fechaDb = formatDate(targetDate);
      const dayName = getDayName(targetDate);
      if (dayName === "Sunday") continue;
      allDates.push(fechaDb);
    }

    const htmlCache: Record<string, string> = {};

    for (const fechaDb of allDates) {
      const dateObj = new Date(fechaDb);
      const dayName = getDayName(dateObj);
      const urlDay = DAYS_MAP[dayName] || "Sabado";
      const url = `${BASE_URL}/index2008.php?Resultado=Quiniela_Nacional_${urlDay}`;

      try {
        const response = await axios.get(url, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 15000,
        });
        htmlCache[fechaDb] = response.data;
      } catch {
        errores++;
      }
    }

    for (const fechaDb of allDates) {
      const html = htmlCache[fechaDb];
      if (!html) continue;

      const $ = cheerio.load(html);
      const results: Record<string, string[]> = {};
      
      const fechaMatch = fechaDb.replace("2026-", "/2026").replace("-", "/");
      
      const allB = $("b").map((_: number, el: cheerio.Element) => $(el).text().trim()).get();
      const nums4 = allB.filter(n => /^\d{4}$/.test(n) && n !== "0000");

      if (nums4.length < 20) {
        errores++;
        continue;
      }

      const numsPerTurno = Math.floor(nums4.length / 5);
      const turnoKeys = ["previa", "primera", "matutina", "vespertina", "nocturna"];

      turnoKeys.forEach((turno, idx) => {
        const start = idx * numsPerTurno;
        const turnonums = nums4.slice(start, start + numsPerTurno);
        if (turnonums.length >= 4) {
          results[turno] = turnonums.slice(0, 20);
        }
      });

      for (const turno of TURNOS) {
        const numbers = results[turno];
        if (!numbers || numbers.length < 20) continue;

        const existing = await fetch(
          `${SB}/rest/v1/draws?date=eq.${fechaDb}&turno=eq.${turno}&select=id&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        );
        const existingData = await existing.json();
        
        if (existingData.length > 0) {
          saltados++;
          continue;
        }

        const insertRes = await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: {
            "apikey": SK,
            "Authorization": `Bearer ${SK}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
          },
          body: JSON.stringify({
            date: fechaDb,
            turno,
            numbers: JSON.stringify(numbers),
            source: SOURCE_NAME,
          }),
        });

        if (insertRes.ok) {
          guardados++;
          resultsByDate[fechaDb] = (resultsByDate[fechaDb] || 0) + 1;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME,
      guardados,
      saltados,
      errores,
      resultsByDate,
      datesProcessed: allDates.length,
    });
  } catch (e: unknown) {
    const error = e as Error;
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}