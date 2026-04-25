import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.lanacion.com.ar";
const SOURCE_NAME = "lanacion";

const TURNOS_MAP: Record<string, string> = {
  "Previa": "previa",
  "Primera": "primera",
  "Matutina": "matutina",
  "Vespertina": "vespertina",
  "Nocturna": "nocturna",
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

    const { data: html } = await axios.get(
      `${BASE_URL}/loterias/quiniela-nacional/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
        },
        timeout: 30000,
      }
    );

    const $ = cheerio.load(html);
    
    const results: Record<string, { numbers: string[]; date: string }> = {};

    $("h2, h3").each((_: number, el: cheerio.Element) => {
      const text = $(el).text();
      
      for (const [turnoName, turno] of Object.entries(TURNOS_MAP)) {
        if (text.includes(turnoName) && text.includes("20")) {
          let numbers: string[] = [];
          let sibling = $(el).next();
          
          for (let i = 0; i < 50 && sibling.length && numbers.length < 20; sibling = sibling.next(), i++) {
            const numText = sibling.text().trim();
            const numMatch = numText.match(/^(\d{5})$/);
            if (numMatch) {
              numbers.push(numMatch[1].slice(1));
            }
          }
          
          if (numbers.length >= 20) {
            let dateStr = "";
            const dateMatch = text.match(/(\d{1,2})\s*de\s*(\w+)\s*de\s*(\d{4})/i);
            if (dateMatch) {
              const months: Record<string, string> = {
                "enero": "01", "febrero": "02", "marzo": "03", "abril": "04",
                "mayo": "05", "junio": "06", "julio": "07", "agosto": "08",
                "septiembre": "09", "octubre": "10", "noviembre": "11", "diciembre": "12"
              };
              const monthNum = months[dateMatch[2].toLowerCase()] || "01";
              dateStr = `${dateMatch[3]}-${monthNum}-${dateMatch[1].padStart(2, "0")}`;
            }
            
            if (!dateStr) {
              dateStr = formatDate(addDays(new Date(), -1));
            }
            
            results[turno] = { numbers, date: dateStr };
          }
        }
      }
    });

    const numberPatterns = html.match(/(\d{5})/g) || [];
    const sortedNumbers = numberPatterns
      .filter(n => n.startsWith("0") || n.startsWith("1") || n.startsWith("2"))
      .slice(0, 100);

    const turnoSections: Record<string, string> = {};
    const sectionMatches = html.matchAll(/##\s*(\w+)\s*-\s*[^#]+/g);
    for (const match of sectionMatches) {
      const sectionText = match[0];
      for (const [turnoName, turno] of Object.entries(TURNOS_MAP)) {
        if (sectionText.toLowerCase().includes(turnoName.toLowerCase())) {
          turnoSections[turno] = sectionText;
        }
      }
    }

    for (const [turno, sectionText] of Object.entries(turnoSections)) {
      const nums = sectionText.match(/(\d{5})/g) || [];
      if (nums.length >= 20) {
        const numbers = nums.slice(0, 20).map(n => n.slice(1));
        
        let dateStr = formatDate(addDays(new Date(), -1));
        
        const dateMatch = sectionText.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (dateMatch) {
          let year = dateMatch[3];
          if (year.length === 2) year = "20" + year;
          dateStr = `${year}-${dateMatch[2].padStart(2, "0")}-${dateMatch[1].padStart(2, "0")}`;
        }
        
        results[turno] = { numbers, date: dateStr };
      }
    }

    for (const [turno, data] of Object.entries(results)) {
      if (data.numbers.length < 20) continue;
      
      const { numbers, date } = data;

      const existing = await fetch(
        `${SB}/rest/v1/draws?date=eq.${date}&turno=eq.${turno}&select=id&limit=1`,
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
          date,
          turno,
          numbers: JSON.stringify(numbers),
          source: SOURCE_NAME,
        }),
      });

      if (insertRes.ok) {
        guardados++;
        resultsByDate[date] = (resultsByDate[date] || 0) + 1;
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
    });
  } catch (e: unknown) {
    const error = e as Error;
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}