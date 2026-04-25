import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://radiomitre.cienradios.com";
const SOURCE_NAME = "radiomitre";

const TURNOS = [
  { name: "La Previa", key: "previa", hours: "10.15" },
  { name: "Primera", key: "primera", hours: "12" },
  { name: "Matutina", key: "matutina", hours: "14:30" },
  { name: "Vespertina", key: "vespertina", hours: "17:30" },
  { name: "Nocturna", key: "nocturna", hours: "21" },
];

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

    for (let i = 0; i < days; i++) {
      const targetDate = addDays(new Date(), -i);
      const fechaDb = formatDate(targetDate);
      const fechaUrl = formatDate(targetDate).replace(/-/g, "-de-");
      
      const monthNames = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
      const day = targetDate.getDate();
      const month = monthNames[targetDate.getMonth()];
      const year = targetDate.getFullYear().toString().slice(-2);
      const fechaUrlAlt = `${day}-de-${month}-de-${year}`;

      const urls = [
        `/sociedad/quiniela-nacional-los-resultados-de-hoy-${fechaUrlAlt}/`,
        `/sociedad/quiniela-nacional-resultados-del-${fechaUrlAlt}/`,
      ];

      let html = "";
      
      for (const url of urls) {
        try {
          const response = await axios.get(
            `${BASE_URL}${url}`,
            {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "es-AR,es;q=0.9",
              },
              timeout: 20000,
            }
          );
          if (response.data && response.data.length > 5000) {
            html = response.data;
            break;
          }
        } catch { continue; }
      }

      if (!html) {
        errores++;
        continue;
      }

      const $ = cheerio.load(html);
      const results: Record<string, string[]> = {};

      const pageText = $("body").text();
      
      for (const turno of TURNOS) {
        const patterns = [
          new RegExp(`Results?\\s+del\\s+${turno.name.toLowerCase()}.*?(?:\\d{1,2}:\\d{2})?\\s*hs?.*?sorteo\\s+completo.*?((?:-\\s*\\d+[°°]\\s*\\d{4}\\s*){20})`, 'is'),
          new RegExp(`${turno.name}[^0-9]*(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})[^0-9]+(\\d{4})`, 'i'),
          new RegExp(`${turno.hours}:\\d{2}\\s*hs[^0-9]*((?:\\d{4}\\s*){20})`, 'i'),
        ];

        for (const pattern of patterns) {
          const match = pageText.match(pattern);
          if (match && match[1]) {
            const nums = match[1].match(/\d{4}/g) || [];
            if (nums.length >= 20) {
              results[turno.key] = nums.slice(0, 20);
              break;
            }
          }
        }
      }

      const listItems = $("li");
      let currentNumbers: string[] = [];
      let currentTurno = "";
      
      listItems.each((_: number, el: cheerio.Element) => {
        const text = $(el).text().trim();
        const numMatch = text.match(/^(\d+)[°º]?\s*(\d{4})$/);
        
        if (numMatch) {
          currentNumbers.push(numMatch[2]);
        }
      });

      const sections = $("h2, h3");
      sections.each((_: number, el: cheerio.Element) => {
        const text = $(el).text();
        
        for (const turno of TURNOS) {
          if (text.toLowerCase().includes(turno.name.toLowerCase()) || text.includes(turno.hours)) {
            const nextElements = $(el).nextUntil("h2, h3");
            let nums: string[] = [];
            
            nextElements.each((i: number, elem: cheerio.Element) => {
              const elemText = $(elem).text();
              const numMatch = elemText.match(/(\d{4})/g);
              if (numMatch) {
                nums.push(...numMatch);
              }
            });
            
            if (nums.length >= 20) {
              results[turno.key] = nums.slice(0, 20);
            }
          }
        }
      });

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
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);

    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME,
      guardados,
      saltados,
      errores,
      resultsByDate,
    });
  } catch (e: unknown) {
    const error = e as Error;
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}