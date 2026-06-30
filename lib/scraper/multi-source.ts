/**
 * Multi-source scraper for Quiniela Nacional Buenos Aires.
 * Tries 3 sources in priority order with exponential backoff retry logic.
 */

import { esFeriado } from "@/lib/feriados"

export interface ScrapeResult {
  numbers: number[];
  source: string;
  timestamp: string;
  attempts: number;
  duration: number;
}

export interface TurnoResult {
  turno: string;
  fecha: string;
  result: ScrapeResult | null;
  error: string | null;
}

const RETRY_DELAYS_MS = [0, 60_000, 300_000, 900_000, 1_800_000];
const MAX_RETRIES = 5;
const TURNOS = ["matutina", "vespertina", "nocturna", "previa", "primera"];
const TURNO_IDX: Record<string, number> = { previa: 0, primera: 1, matutina: 2, vespertina: 3, nocturna: 4 };
const NUMBERS_PER_DRAW = 20;
const MAX_NUMBER = 9999;

function pad(n: number, size: number): string {
  return String(n).padStart(size, "0");
}

function parseNumbers(raw: string[], source: string, start: number): number[] {
  const nums: number[] = [];
  const seen = new Set<number>();
  for (const m of raw) {
    const n = parseInt(m, 10);
    if (isNaN(n) || n < 0 || n > MAX_NUMBER) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    nums.push(n);
    if (nums.length === NUMBERS_PER_DRAW) break;
  }
  return nums;
}

function htmlExtractNumbers(html: string): string[] {
  const matches: string[] = [];
  const re = /class="numero">(\d{3,4})<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m[1]);
  return matches;
}

function htmlExtractNumbersAlt(html: string): string[] {
  const matches: string[] = [];
  const re = /class="veintena"[^>]*>[\s\S]*?(\d{3,4})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m[1]);
  return matches;
}

function htmlExtractNumbersGob(html: string): string[] {
  const matches: string[] = [];
  const re = /<div class="pos">\d{2}<\/div>\s*<div>(\d{4})<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m[1]);
  return matches;
}

function buildQuinielaNacionalURL(fechaISO: string, turno: string): string {
  const d = new Date(fechaISO + "T12:00:00Z");
  const dd = pad(d.getUTCDate(), 2);
  const mm = pad(d.getUTCMonth() + 1, 2);
  const yy = pad(d.getUTCFullYear() % 100, 2);
  const turnoCap = turno.charAt(0).toUpperCase() + turno.slice(1);
  return `https://quinielanacional1.com.ar/${dd}-${mm}-${yy}/${turnoCap}`;
}

function computeSorteoCode(fechaISO: string, turno: string): number {
  const refDate = new Date("2026-06-08T12:00:00Z");
  const refCode = 52492;
  const target = new Date(fechaISO + "T12:00:00Z");
  const diffMs = target.getTime() - refDate.getTime();
  const diffDays = Math.round(diffMs / 86_400_000);
  // Count weekdays only (skip Sundays — no draws), +1 per weekday (not per turno)
  let weekdays = 0;
  for (let i = 1; i <= diffDays; i++) {
    const d = new Date(refDate.getTime() + i * 86_400_000);
    if (d.getUTCDay() === 0) continue;
    const ds = d.toISOString().slice(0, 10);
    if (esFeriado(ds)) continue;
    weekdays++;
  }
  const turnoKey = turno.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  const turnoIdx = TURNO_IDX[turnoKey] ?? 0
  return refCode + weekdays * 5 + turnoIdx;
}

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 30_000): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}

async function source1(fechaISO: string, turno: string): Promise<ScrapeResult> {
  const url = buildQuinielaNacionalURL(fechaISO, turno);
  const t0 = Date.now();
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  let raw = htmlExtractNumbers(html);
  if (raw.length < NUMBERS_PER_DRAW) raw = htmlExtractNumbersAlt(html);
  const numbers = parseNumbers(raw, "quinielanacional1", 0);

  return {
    numbers,
    source: "quinielanacional1.com.ar",
    timestamp: new Date().toISOString(),
    attempts: 1,
    duration: Date.now() - t0,
  };
}

async function source2(fechaISO: string, turno: string): Promise<ScrapeResult> {
  const sorteo = computeSorteoCode(fechaISO, turno);
  const url = "https://quiniela.loteriadelaciudad.gob.ar/resultadosQuiniela/consultaResultados.php";
  const body = `codigo=0080&juridiccion=51&sorteo=${sorteo}`;
  const t0 = Date.now();

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();

  const raw = htmlExtractNumbersGob(html);
  const numbers = parseNumbers(raw, "loteriaciudad", 0);

  return {
    numbers,
    source: "loteriaciudad",
    timestamp: new Date().toISOString(),
    attempts: 1,
    duration: Date.now() - t0,
  };
}

async function source3(_fechaISO: string, _turno: string): Promise<ScrapeResult> {
  const t0 = Date.now();
  const urls = [
    "https://www.quiniela.gob.ar/",
    "https://quiniela.gob.ar/resultados",
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url);
      if (!res.ok) continue;
      const html = await res.text();
      const raw = htmlExtractNumbers(html);
      if (raw.length >= 4) {
        const numbers = parseNumbers(raw, "quiniela.gob.ar", 0);
        return {
          numbers,
          source: "quiniela.gob.ar",
          timestamp: new Date().toISOString(),
          attempts: 1,
          duration: Date.now() - t0,
        };
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Source 3: no URLs returned data");
}

function htmlExtractNumbersNacional(html: string): string[] {
  const matches: string[] = [];
  const re = /<div class="numero">(\d{3,4})<\/div>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) matches.push(m[1]);
  return matches;
}

async function source4(fechaISO: string, turno: string): Promise<ScrapeResult> {
  const t0 = Date.now();
  const d = new Date(fechaISO + "T12:00:00Z");
  const dd = pad(d.getUTCDate(), 2);
  const mm = pad(d.getUTCMonth() + 1, 2);
  const yy = String(d.getUTCFullYear()).slice(2);
  const turnoPath = turno.charAt(0).toUpperCase() + turno.slice(1);

  const urls = [
    `https://quiniela-nacional.com/${dd}-${mm}-${yy}/${turnoPath}`,
    `https://quiniela-nacional.com/${turnoPath}`,
  ];

  let lastError: Error | null = null;
  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {}, 15_000);
      if (!res.ok) continue;
      const html = await res.text();
      const raw = htmlExtractNumbersNacional(html);
      if (raw.length >= 4) {
        const numbers = parseNumbers(raw, "quiniela-nacional.com", 0);
        return {
          numbers,
          source: "quiniela-nacional.com",
          timestamp: new Date().toISOString(),
          attempts: 1,
          duration: Date.now() - t0,
        };
      }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastError ?? new Error("Source 4: quiniela-nacional.com returned no data");
}

const SOURCES = [source1, source2, source3, source4];

async function attemptWithRetry(
  fechaISO: string,
  turno: string,
): Promise<ScrapeResult> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
      await new Promise((r) => setTimeout(r, delay));
    }

    for (let s = 0; s < SOURCES.length; s++) {
      try {
        const result = await SOURCES[s](fechaISO, turno);
        if (result.numbers.length >= NUMBERS_PER_DRAW) {
          result.attempts = attempt;
          return result;
        }
        if (result.numbers.length > 0) {
          result.attempts = attempt;
          return result;
        }
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
    }
  }

  console.error(
    `[multi-source] All sources exhausted for ${fechaISO} ${turno}:`,
    lastError?.message,
  );

  return {
    numbers: [],
    source: "none",
    timestamp: new Date().toISOString(),
    attempts: MAX_RETRIES,
    duration: 0,
  };
}

export async function scrapeAllSources(
  fechaISO: string,
  turno: string,
): Promise<ScrapeResult> {
  return attemptWithRetry(fechaISO, turno);
}

export async function scrapeAllTurnos(fechaISO: string): Promise<TurnoResult[]> {
  const results: TurnoResult[] = [];

  for (const turno of TURNOS) {
    try {
      const result = await scrapeAllSources(fechaISO, turno);
      results.push({
        turno,
        fecha: fechaISO,
        result,
        error: result.numbers.length === 0 ? "No numbers obtained" : null,
      });
    } catch (e) {
      results.push({
        turno,
        fecha: fechaISO,
        result: null,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return results;
}
