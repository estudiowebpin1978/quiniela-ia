import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://quinielanacional1.com.ar";
const SOURCE_NAME = "quinielanacional1";

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
        error_message: errorMessage || null,
      })
    });
  } catch (e) { console.log("Log error:", e); }
}

function parseTurno(turnoText: string): string {
  const t = turnoText.toLowerCase();
  if (t.includes("nocturna")) return "nocturna";
  if (t.includes("vespertina")) return "vespertina";
  if (t.includes("matutina")) return "matutina";
  if (t.includes("primera")) return "primera";
  if (t.includes("previa")) return "previa";
  return "";
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
    const { data: html } = await axios.get(BASE_URL + "/quinielanacional/", {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      timeout: 30000,
    });

    const $ = cheerio.load(html);
    
    const sorteos: Record<string, { fecha: string; turno: string; numeros: string[] }> = {};
    
    const links: string[] = [];
    $("a").each((_: number, el: cheerio.Element) => {
      const href = $(el).attr("href") || "";
      if (href.includes("/quiniela-nacional/") && href.match(/\d{2}-\d{2}-\d{2}/)) {
        let cleanPath = href.startsWith("http") ? new URL(href).pathname : href;
        links.push(cleanPath);
      }
    });

    const uniqueLinks = [...new Set(links)].slice(0, limit);
    
    for (const link of uniqueLinks) {
      try {
        const fechaMatch = link.match(/(\d{2})-(\d{2})-(\d{2})/);
        if (!fechaMatch) continue;
        
        const fechaUrl = `${fechaMatch[3]}-${fechaMatch[2]}-${fechaMatch[1]}`;
        
        const dayResponse = await axios.get(BASE_URL + link, {
          headers: { "User-Agent": "Mozilla/5.0" },
          timeout: 15000,
        });
        
        const $$ = cheerio.load(dayResponse.data);
        
        $$("h3, h4").each((_: number, heading: cheerio.Element) => {
          const headingText = $$(heading).text();
          const turno = parseTurno(headingText);
          if (!turno) return;

          const afterSiblings = $$(heading).nextAll();
          let numbers: string[] = [];
          afterSiblings.slice(0, 2).each((__: number, el: cheerio.Element) => {
            const divText = $$(el).text();
            const found = divText.match(/\d{4}/g) || [];
            numbers = numbers.concat(found);
          });

          if (numbers.length >= 20) {
            const key = `${fechaUrl}-${turno}`;
            if (!sorteos[key]) {
              sorteos[key] = { fecha: fechaUrl, turno, numeros: numbers.slice(0, 20) };
            }
          }
        });
      } catch (e) {
      }
    }

    const keys = Object.keys(sorteos);
    if (keys.length === 0) {
      await insertLog(SOURCE_NAME, "skipped", 0, "No se encontraron sorteos");
      return NextResponse.json({ ok: false, msg: "No se encontraron sorteos" });
    }

    let guardados = 0;
    const resultsByDate: Record<string, number> = {};

    for (const key of keys) {
      const s = sorteos[key];
      if (!s || s.numeros.length < 20) continue;

      try {
        const existing = await fetch(
          `${SB}/rest/v1/draws?date=eq.${s.fecha}&turno=eq.${s.turno}&select=id&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        );
        const existingData = await existing.json();
        if (existingData.length > 0) continue;

        const res = await fetch(`${SB}/rest/v1/draws`, {
          method: "POST",
          headers: {
            "apikey": SK,
            "Authorization": `Bearer ${SK}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates",
          },
          body: JSON.stringify({
            date: s.fecha,
            turno: s.turno,
            numbers: s.numeros,
            source: SOURCE_NAME
          })
        });

        if (res.ok || res.status === 201) {
          guardados++;
          resultsByDate[s.fecha] = (resultsByDate[s.fecha] || 0) + 1;
        }
      } catch (e) {
        console.log("Insert error:", e);
      }
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);
    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME + ".com.ar",
      guardados,
      totalProcesados: keys.length,
      resultsByDate
    });

  } catch (e: any) {
    await insertLog(SOURCE_NAME, "failed", 0, e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}