import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.ruta1000.com.ar";
const SOURCE_NAME = "ruta1000-v3";

const TURNOS_MAP: Record<string, string> = {
  "previa": "previa",
  "primera": "primera",
  "matutina": "matutina",
  "vespertina": "vespertina",
  "nocturna": "nocturna",
};

const DAYS_MAP: Record<string, string> = {
  "Lunes": "Monday",
  "Martes": "Tuesday",
  "Miercoles": "Wednesday",
  "Miércoles": "Wednesday",
  "Jueves": "Thursday",
  "Viernes": "Friday",
  "Sabado": "Saturday",
  "Sábado": "Saturday",
};

async function insertLog(source: string, status: "success" | "failed" | "skipped", recordsInserted: number, errorMessage?: string | null) {
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
        error_message: errorMessage,
        synced_at: new Date().toISOString(),
      }),
    });
  } catch { /* ignore */ }
}

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function getDayName(date: Date): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return days[date.getDay()];
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "3");

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

    const targetDate = addDays(new Date(), -1);
    const fechaDb = formatDate(targetDate);
    const dayName = getDayName(targetDate);
    const daySpanish = Object.keys(DAYS_MAP).find(key => DAYS_MAP[key] === dayName) || 
                       Object.keys(DAYS_MAP).find(key => key.toEnglish() === dayName);

    const urlDayMap: Record<string, string> = {
      "Monday": "Lunes",
      "Tuesday": "Martes", 
      "Wednesday": "Miercoles",
      "Thursday": "Jueves",
      "Friday": "Viernes",
      "Saturday": "Sabado",
    };

    const urlDay = urlDayMap[dayName] || "Sabado";
    const url = `${BASE_URL}/index2008.php?Resultado=Quiniela_Nacional_${urlDay}#Sorteos`;

    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      timeout: 20000,
    });

    const html = response.data;
    const $ = cheerio.load(html);
    const bodyText = $("body").text();

    const results: Record<string, string[]> = {};
    
    const sectionHeaders = $("h1, h2");
    
    sectionHeaders.each((_: number, el: cheerio.Element) => {
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
      
      for (let i = 0; i < 100 && sibling.length; sibling = sibling.next(), i++) {
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

    const h2Texts = $("h2").map((_: number, el: cheerio.Element) => $(el).text()).get();
    
    const turnoPatterns: Record<string, RegExp> = {
      "previa": /previa/i,
      "primera": /primera/i,
      "matutina": /matutina/i,
      "vespertina": /vespertina/i,
      "nocturna": /nocturna/i,
    };

    for (const [turno, pattern] of Object.entries(turnoPatterns)) {
      if (results[turno]) continue;
      
      for (let i = 0; i < h2Texts.length; i++) {
        const h2Text = h2Texts[i];
        
        if (pattern.test(h2Text)) {
          const followingText = h2Texts.slice(i).join(" ");
          const nums = followingText.match(/\b(\d{4})\b/g) || [];
          
          const validNums = nums.filter(n => 
            n !== "0000" && n !== "2026" && n !== "2008" && n !== "1999"
          );
          
          if (validNums.length >= 20) {
            results[turno] = validNums.slice(0, 20);
            break;
          }
        }
      }
    }

    const allNumbers = bodyText.match(/<strong>(\d{4})<\/strong>/g) || [];
    const cleanedNumbers = allNumbers.map(n => n.replace(/<\/?strong>/g, "")).slice(0, 100);

    for (const [turno, numbers] of Object.entries(results)) {
      if (numbers.length < 20) continue;

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

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);

    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME,
      guardados,
      saltados,
      errores,
      resultsByDate,
      foundTurnos: Object.keys(results),
      urlDay,
      sampleNumbers: results["previa"] || [],
    });
  } catch (e: unknown) {
    const error = e as Error;
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}