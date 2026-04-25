import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.nacionalloteria.com";
const SOURCE_NAME = "nacionalloteria";

const TURNOS = ["primera", "matutina", "vespertina", "nocturna"];

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

async function scrapeDetailPage(url: string): Promise<string[]> {
  try {
    const { data } = await axios.get(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });

    const $ = cheerio.load(data);
    const numbers: string[] = [];

    $("table tr").each((_: number, row: cheerio.Element) => {
      const cells = $(row).find("td");
      if (cells.length >= 2) {
        const posText = $(cells[0]).text().trim();
        const numText = $(cells[1]).text().trim();
        if (/^\d{1,2}$/.test(posText) && /^\d{4}$/.test(numText)) {
          numbers.push(numText);
        }
      }
    });

    return numbers.slice(0, 20);
  } catch {
    return [];
  }
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
  const days = parseInt(req.nextUrl.searchParams.get("days") || "0");
  const skipExisting = req.nextUrl.searchParams.get("skip") !== "false";

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
    const startDate = addDays(new Date(), -days);

    let processed = 0;
    let currentDate = new Date();

    while (currentDate >= startDate) {
      const fechaStr = formatDate(currentDate);

      for (const turno of TURNOS) {
        const url = `${BASE_URL}/argentina/quiniela-nacional.php?del-dia=${fechaStr}&periodo=${turno}`;

        try {
          if (skipExisting) {
            const existing = await fetch(
              `${SB}/rest/v1/draws?date=eq.${fechaStr}&turno=eq.${turno}&select=id&limit=1`,
              { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
            );
            const existingData = await existing.json();
            if (existingData.length > 0) {
              saltados++;
              continue;
            }
          }

          const numbers = await scrapeDetailPage(url);

          if (numbers.length < 20) {
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
              date: fechaStr,
              turno,
              numbers: JSON.stringify(numbers),
              source: SOURCE_NAME,
            }),
          });

          if (insertRes.ok) {
            guardados++;
            resultsByDate[fechaStr] = (resultsByDate[fechaStr] || 0) + 1;
          }

          processed++;
        } catch { errores++; }
      }

      currentDate = addDays(currentDate, -1);

      if (processed >= 500 && days > 0) break;
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