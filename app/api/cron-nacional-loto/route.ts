import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.nacionalloteria.com";
const SOURCE_NAME = "nacionalloteria";

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

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "30");

  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  try {
    const { data: html } = await axios.get(`${BASE_URL}/argentina/index.php`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
        "Accept-Language": "es-ES,es;q=0.9",
      },
      timeout: 30000,
    });

    const $ = cheerio.load(html);
    const detailLinks: { url: string; fecha: string; turno: string }[] = [];
    const seenKeys = new Set<string>();

    $("a").each((_: number, el: cheerio.Element) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text();

      if (href.includes("quiniela-nacional.php") && href.includes("periodo=")) {
        const turnoMatch = href.match(/periodo=(\w+)/);
        const fechaMatch = href.match(/del-dia=([\d-]+)/);

        if (turnoMatch && fechaMatch) {
          const turno = turnoMatch[1];
          const fecha = fechaMatch[1];
          const key = `${fecha}-${turno}`;

          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            detailLinks.push({
              url: BASE_URL + href,
              fecha,
              turno,
            });
          }
        }
      }
    });

    const toProcess = detailLinks.slice(0, limit);
    let guardados = 0;
    const resultsByDate: Record<string, number> = {};

    for (const link of toProcess) {
      const numbers = await scrapeDetailPage(link.url);

      if (numbers.length < 20) continue;

      try {
        const existing = await fetch(
          `${SB}/rest/v1/draws?date=eq.${link.fecha}&turno=eq.${link.turno}&select=id&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        );
        const existingData = await existing.json();
        if (existingData.length > 0) continue;

        const insertRes = await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: {
            "apikey": SK,
            "Authorization": `Bearer ${SK}`,
            "Content-Type": "application/json",
            "Prefer": "return=representation",
          },
          body: JSON.stringify({
            date: link.fecha,
            turno: link.turno,
            numbers: JSON.stringify(numbers),
            source: SOURCE_NAME,
          }),
        });

        if (insertRes.ok) {
          guardados++;
          resultsByDate[link.fecha] = (resultsByDate[link.fecha] || 0) + 1;
        }
      } catch { /* skip */ }
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);

    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME,
      guardados,
      totalProcesados: toProcess.length,
      resultsByDate,
    });
  } catch (e: unknown) {
    const error = e as Error;
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}