import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://quinielanacional1.com.ar";
const SOURCE_NAME = "quinielanacional1";

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"];

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

function formatDateUrl(date: Date): string {
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear().toString().slice(-2)}`;
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
      const fechaUrl = formatDateUrl(targetDate);
      const fechaDb = formatDate(targetDate);

      try {
        const { data: html } = await axios.get(
          `${BASE_URL}/${fechaUrl}`,
          {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
              "Accept": "text/html",
            },
            timeout: 20000,
          }
        );

        const $ = cheerio.load(html);
        const text = $("body").text();
        
        for (const turno of TURNOS) {
          const turnoNormalizado = TURNOS_MAP[turno];
          
          const nacionalMatch = text.match(new RegExp(`Nacional[^0-9]*([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})[^0-9]+([0-9]{4})`, 'i'));
          
          if (!nacionalMatch) continue;
          
          const numbers = nacionalMatch.slice(1, 21);
          if (numbers.length < 20) continue;

          const existing = await fetch(
            `${SB}/rest/v1/draws?date=eq.${fechaDb}&turno=eq.${turnoNormalizado}&select=id&limit=1`,
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
              turno: turnoNormalizado,
              numbers: JSON.stringify(numbers),
              source: SOURCE_NAME,
            }),
          });

          if (insertRes.ok) {
            guardados++;
            resultsByDate[fechaDb] = (resultsByDate[fechaDb] || 0) + 1;
          }
        }
      } catch (e) {
        errores++;
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