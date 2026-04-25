import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.ruta1000.com.ar";
const SOURCE_NAME = "ruta1000";

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];

const DAYS_MAP: Record<string, string> = {
  "Monday": "Lunes",
  "Tuesday": "Martes",
  "Wednesday": "Miercoles",
  "Thursday": "Jueves",
  "Friday": "Viernes",
  "Saturday": "Sabado",
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

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const secret = request.nextUrl.searchParams.get("secret");
  
  if (!secret || secret !== CRON_SECRET) {
    return new NextResponse("Unauthorized", { 
      status: 401, 
      headers: { 
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      } 
    });
  }

  if (!SB || !SK) {
    return NextResponse.json(
      { success: false, error: "Supabase no configurado" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const daysParam = request.nextUrl.searchParams.get("days") || "1";
    const days = parseInt(daysParam);
    
    let guardados = 0;
    let saltados = 0;
    let errores = 0;
    const resultsByDate: Record<string, number> = {};

    for (let i = 0; i < days; i++) {
      const targetDate = addDays(new Date(), -i);
      const dayName = getDayName(targetDate);
      
      if (dayName === "Sunday") continue;

      const fechaDb = formatDate(targetDate);
      const urlDay = DAYS_MAP[dayName] || "Sabado";
      const url = `${BASE_URL}/index2008.php?Resultado=Quiniela_Nacional_${urlDay}#Sorteos`;

      let html = "";
      try {
        const response = await axios.get(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Cache-Control": "no-cache",
          },
          timeout: 25000,
        });
        html = response.data;
      } catch (e) {
        errores++;
        continue;
      }

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
        
        for (let j = 0; j < 150 && sibling.length; sibling = sibling.next(), j++) {
          const numText = sibling.text().trim();
          const match = numText.match(/^(\d{4})$/);
          if (match) {
            numbers.push(match[1]);
          }
          if (numbers.length >= 20) break;
        }
        
        if (numbers.length >= 20) {
          results[turno] = numbers.slice(0, 20);
        }
      });

      if (Object.keys(results).length === 0) {
        const allStrong = $("strong").map((_: number, el: cheerio.Element) => $(el).text().trim()).get();
        const allNums = allStrong.filter(n => /^\d{4}$/.test(n) && n !== "0000");
        
        if (allNums.length >= 100) {
          const numsPerTurno = Math.floor(allNums.length / 5);
          const turnoKeys = ["previa", "primera", "matutina", "vespertina", "nocturna"];
          
          turnoKeys.forEach((turno, idx) => {
            const start = idx * numsPerTurno;
            const turnonums = allNums.slice(start, start + numsPerTurno);
            if (turnonums.length >= 4) {
              results[turno] = turnonums.slice(0, 20);
            }
          });
        }
      }

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
    }

    return NextResponse.json(
      {
        success: true,
        source: SOURCE_NAME,
        guardados,
        saltados,
        errores,
        resultsByDate,
        debug: {
          urlDay,
          htmlLength: html?.length || 0,
          h2Count: $("h2").length,
          strongCount: $("strong").length,
        }
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
        },
      }
    );
  } catch (error: any) {
    console.error("Scraping failed:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        stack: error.stack,
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
          "Surrogate-Control": "no-store",
        },
      }
    );
  }
}