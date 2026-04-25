import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import * as cheerio from "cheerio";

const CRON_SECRET = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || "";
const SK = process.env.SUPABASE_SERVICE_KEY?.replace(/"/g, "").trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || "";

const BASE_URL = "https://www.ruta1000.com.ar";
const SOURCE_NAME = "ruta1000-v2";

console.log("Starting ruta1000 scraper v2");
const TURNOS = ["LA PREVIA", "PRIMERA", "MATUTINA", "VESPERTINA", "NOCTURNA"];

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
  return `${date.getFullYear()}_${String(date.getMonth() + 1).padStart(2, "0")}_${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function normalizeTurno(text: string): string {
  const t = text.toUpperCase();
  if (t.includes("PREVIA")) return "previa";
  if (t.includes("PRIMERA")) return "primera";
  if (t.includes("MATUTINA")) return "matutina";
  if (t.includes("VESPERTINA")) return "vespertina";
  if (t.includes("NOCTURNA")) return "nocturna";
  return "";
}

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

async function extractNumbersFromHtml(html: string, targetDate: Date): Promise<Record<string, string[]>> {
  const $ = cheerio.load(html);
  const results: Record<string, string[]> = {};
  
  let currentQuiniela = "";
  let currentTurno = "";
  let numbers: string[] = [];
  let inNacionalSection = false;

  const bodyText = $("body").text();
  
  const blocks = bodyText.split(/QUINIELA/);
  
  for (const block of blocks) {
    const hasCiudad = block.includes("CIUDAD") || block.includes("LA CIUDAD");
    const hasExNacional = block.includes("EX-NACIONAL") || block.includes("NACIONAL");
    
    if (!hasCiudad || !hasExNacional) continue;
    
    currentQuiniela = "nacional";
    numbers = [];
    
    for (const turno of TURNOS) {
      if (block.includes(turno)) {
        currentTurno = normalizeTurno(turno);
        
        const parts = block.split(turno);
        if (parts.length > 1) {
          const numsSection = parts[1];
          const nums = numsSection.match(/\b\d{4}\b/g) || [];
          const validNums = nums.filter(n => 
            n !== "0000" && n !== "2026" && n !== "2008" && n !== "1999" && n !== "5449" && n !== "3292" && n !== "1844" && n !== "9355"
          );
          
          if (validNums.length >= 20) {
            const key = `nacional_${currentTurno}`;
            results[key] = validNums.slice(0, 20);
          }
        }
        break;
      }
    }
  }

  return results;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const days = parseInt(req.nextUrl.searchParams.get("days") || "3");

  if (!secret || secret !== CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!SB || !SK) {
    return NextResponse.json({ error: "Supabase no configurado" }, { status: 500 });
  }

  const targetDate = addDays(new Date(), -1);
  
  try {
    console.log("Fetching from:", BASE_URL + "/timberos_top/wap.php");
    
    const response = await axios.get(
      `${BASE_URL}/timberos_top/wap.php`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "es-ES,es;q=0.9",
        },
        timeout: 45000,
      }
    );

    const html = response.data as string;
    console.log("HTML received, length:", html.length);
    
    const extractedNumbers = await extractNumbersFromHtml(html, targetDate);
    console.log("Numbers extracted:", JSON.stringify(extractedNumbers));
    
    let guardados = 0;
    let saltados = 0;
    
    for (const [key, numbers] of Object.entries(extractedNumbers)) {
      if (numbers.length < 20) continue;
      
      const [quiniela, turno] = key.split("_");
      if (quiniela !== "nacional") continue;
      
      const fechaDb = formatDate(targetDate);
      
      const existing = await fetch(
        `${SB}/rest/v1/draws?date=eq.${fechaDb}&turno=eq.${turno}&select=id&limit=1`,
        { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
      );
      const existingData = await existing.json();
      
      if (existingData.length > 0) {
        console.log(`Skipping ${fechaDb} ${turno} - already exists`);
        saltados++;
        continue;
      }
      
      console.log(`Inserting ${fechaDb} ${turno}:`, numbers.slice(0, 5));
      
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
      }
    }

    await insertLog(SOURCE_NAME, guardados > 0 ? "success" : "skipped", guardados);
    
    console.log("Done - guardados:", guardados, "saltados:", saltados);
    
    return NextResponse.json({
      ok: true,
      source: SOURCE_NAME,
      guardados,
      saltados,
      extracted: extractedNumbers,
    });
  } catch (e: unknown) {
    const error = e as Error;
    console.log("Error:", error.message);
    await insertLog(SOURCE_NAME, "failed", 0, error.message);
    return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
  }
}