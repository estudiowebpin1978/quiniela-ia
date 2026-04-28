import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";

const BASE_URL = "https://quinieladelaciudad.ruta1000.com.ar";
const SOURCE_NAME = "quiniela-ciudad-v1";

const TURNOS = ["previa", "primera", "matutina", "vespertina", "nocturna"];

function getSK(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim();
}

function getSB(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim();
}

async function insertLog(source: string, status: "success" | "failed" | "skipped", recordsInserted: number, errorMessage?: string | null) {
  const SB = getSB();
  const SK = getSK();
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

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const force = req.nextUrl.searchParams.get("force") === "true";
  const history = req.nextUrl.searchParams.get("history") === "true";
  const daysParam = parseInt(req.nextUrl.searchParams.get("days") || "1");

  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const SB = getSB();
  const SK = getSK();

  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const days = Math.min(Math.max(daysParam, 1), 30)
  const results: any[] = []
  let guardados = 0
  let errores = 0
  let saltados = 0

  if (history) {
    for (let d = 0; d < days; d++) {
      const now = new Date()
      now.setDate(now.getDate() - d)
      
      let html = ""
      try {
        const response = await axios.get(BASE_URL, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "text/html,application/xhtml+xml",
          },
          timeout: 25000,
        })
        html = response.data
      } catch {
        continue
      }

      const $ = cheerio.load(html)
      const fechaDb = formatDate(now)
      const drawResults: Record<string, string[]> = {}

      const allTds = $("td").map((_, el) => $(el).text().trim()).get()
      const allNums = allTds.filter(n => /^\d{4}$/.test(n) && n !== "0000" && parseInt(n) > 0 && n !== "0001")

      const numsPerTurno = Math.floor(allNums.length / 5)

      if (allNums.length >= 100) {
        const turnoKeys = ["previa", "primera", "matutina", "vespertina", "nocturna"]
        turnoKeys.forEach((turno, idx) => {
          const start = idx * numsPerTurno
          const end = start + numsPerTurno
          const turnonums = allNums.slice(start, end)
          if (turnonums.length >= 20) {
            drawResults[turno] = turnonums.slice(0, 20)
          }
        })
      }

      const dayResult: any = { fecha: fechaDb, turnos: [] }

      for (const turno of TURNOS) {
        const numbers = drawResults[turno]
        if (!numbers || numbers.length < 20) {
          saltados++
          dayResult.turnos.push({ turno, ok: false, total: 0 })
          continue
        }

        const numArray = numbers.map(n => parseInt(n))

        await fetch(`${SB}/rest/v1/draws?date=eq.${fechaDb}&turno=eq.${turno}`, {
          method: "DELETE",
          headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Prefer": "return=minimal" }
        })

        const r = await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify({ date: fechaDb, turno, numbers: numArray })
        })

        if (r.ok) {
          guardados++
          dayResult.turnos.push({ turno, ok: true, total: numbers.length })
        } else {
          errores++
          dayResult.turnos.push({ turno, ok: false, total: 0 })
        }
      }
      results.push(dayResult)
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados, `history: ${days} days`)

    return NextResponse.json({
      ok: guardados > 0,
      source: SOURCE_NAME,
      totalDays: days,
      guardados,
      errores,
      saltados,
      results
    })
  }

  // Original single day logic
  try {
    let guardados = 0;
    let saltados = 0;
    let errores = 0;
    const drawResultsByDate: Record<string, number> = {};

    let html = "";
    try {
      const response = await axios.get(BASE_URL, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "text/html,application/xhtml+xml",
        },
        timeout: 25000,
      });
      html = response.data;
    } catch (e: unknown) {
      console.error("Error fetching:", e);
      return NextResponse.json({ error: "No se pudo obtener datos" }, { status: 500 });
    }

    const $ = cheerio.load(html);
    const fechaDb = formatDate(new Date());

    const drawResults: Record<string, string[]> = {};

    const allTds = $("td").map((_, el) => $(el).text().trim()).get();
    const allNums = allTds.filter(n => /^\d{4}$/.test(n) && n !== "0000" && parseInt(n) > 0 && n !== "0001");

    const numsPerTurno = Math.floor(allNums.length / 5);

    if (allNums.length >= 100) {
      const turnoKeys = ["previa", "primera", "matutina", "vespertina", "nocturna"];
      turnoKeys.forEach((turno, idx) => {
        const start = idx * numsPerTurno;
        const end = start + numsPerTurno;
        const turnonums = allNums.slice(start, end);
        if (turnonums.length >= 20) {
          drawResults[turno] = turnonums.slice(0, 20);
          console.log(`Parsed ${turno}: ${drawResults[turno]!.length} numbers`);
        }
      });
    }

    for (const turno of TURNOS) {
      const numbers = drawResults[turno];
      if (!numbers || numbers.length < 20) {
        console.log(`Skipping ${turno}: no data`);
        continue;
      }

      const numArray = numbers.map(n => parseInt(n));

      await fetch(`${SB}/rest/v1/draws?date=eq.${fechaDb}&turno=eq.${turno}`, {
        method: "DELETE",
        headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Prefer": "return=minimal" }
      });

      const r = await fetch(`${SB}/rest/v1/draws`, {
        method: "POST",
        headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
        body: JSON.stringify({ date: fechaDb, turno, numbers: numArray })
      });

      if (r.ok) {
        guardados++;
        drawResultsByDate[fechaDb] = (drawResultsByDate[fechaDb] || 0) + 1;
        console.log(`Saved ${turno}: OK`);
      } else {
        errores++;
        const err = await r.text();
        console.log(`Error saving ${turno}: ${r.status} - ${err.slice(0, 100)}`);
      }
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);

    const sampleResults: Record<string, string[]> = {};
    for (const t of TURNOS) {
      if (drawResults[t]) sampleResults[t] = drawResults[t].slice(0, 5);
    }

    return NextResponse.json({
      ok: guardados > 0,
      source: SOURCE_NAME,
      guardados,
      saltados,
      errores,
      drawResultsByDate,
      debug: {
        htmlLength: html.length,
        drawResultsKeys: Object.keys(drawResults),
        drawResultsCount: Object.keys(drawResults).length,
        sampleResults,
        allNumsCount: allNums.length,
        source: BASE_URL,
      }
    });
  } catch (e: unknown) {
    const error = e as Error;
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}