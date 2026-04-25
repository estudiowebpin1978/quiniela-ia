import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.ruta1000.com.ar";
const SOURCE_NAME = "ruta1000-new-v5";

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];

const DAYS_MAP: Record<string, string> = {
  "Monday": "Lunes", "Tuesday": "Martes", "Wednesday": "Miercoles",
  "Thursday": "Jueves", "Friday": "Viernes", "Saturday": "Sabado",
};

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDayName(date: Date): string {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][date.getDay()];
}

export const dynamic = 'force-dynamic';
export const fetchCache = 'no-store';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  
  if (!secret || secret !== CRON_SECRET) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  if (!SB || !SK) {
    return NextResponse.json({ success: false, error: "Supabase not configured" }, { status: 500 });
  }

  const days = parseInt(request.nextUrl.searchParams.get("days") || "1");
  
  let guardados = 0;
  let saltados = 0;
  let errores = 0;
  const resultsByDate: Record<string, number> = {};

  try {
    const targetDate = addDays(new Date(), -1);
    const dayName = getDayName(targetDate);
    
    if (dayName === "Sunday") {
      return NextResponse.json({ success: true, message: "No lottery on Sundays", guardados: 0 });
    }

    const fechaDb = formatDate(targetDate);
    const urlDay = DAYS_MAP[dayName] || "Sabado";
    
    const response = await axios.get(
      `${BASE_URL}/index2008.php?Resultado=Quiniela_Nacional_${urlDay}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html",
        },
        timeout: 30000,
      }
    );

    const html = response.data;
    const $ = cheerio.load(html);
    
    const results: Record<string, string[]> = {};

    $("h2").each((_: number, el: cheerio.Element) => {
      const text = $(el).text().toLowerCase();
      
      let turno = "";
      if (text.includes("previa")) turno = "previa";
      else if (text.includes("primera")) turno = "primera";
      else if (text.includes("matutina")) turno = "matutina";
      else if (text.includes("vespertina")) turno = "vespertina";
      else if (text.includes("nocturna")) turno = "nocturna";
      
      if (!turno || results[turno]) return;
      
      let numbers: string[] = [];
      let sibling = $(el).next();
      
      for (let j = 0; j < 200 && sibling.length; sibling = sibling.next(), j++) {
        const numText = sibling.text().trim();
        const match = numText.match(/^(\d{4})$/);
        if (match) numbers.push(match[1]);
        if (numbers.length >= 20) break;
      }
      
      if (numbers.length >= 20) results[turno] = numbers.slice(0, 20);
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

    return NextResponse.json(
      {
        success: true,
        source: SOURCE_NAME,
        guardados,
        saltados,
        errores,
        resultsByDate,
        foundTurnos: Object.keys(results),
        debug: { urlDay, h2Count: $("h2").length, strongCount: $("strong").length }
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return NextResponse.json(
      { success: false, error: error.message, source: SOURCE_NAME },
      { status: 200 }
    );
  }
}