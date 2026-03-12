import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Este endpoint es llamado por Vercel Cron diariamente
// Horario: lunes a viernes 22:30 hora Argentina
// Configurado en vercel.json → crons

const SORTEOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"];
const BASE_URL = "https://quinielanacional.ruta1000.com.ar";

async function fetchSorteo(date: string, sorteo: string): Promise<number[] | null> {
  const sorteoKey = sorteo.toLowerCase();
  const url = `${BASE_URL}/quiniela-nacional/${date.replace(/-/g, "/")}/${sorteoKey}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "QuinielaIA/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extraer números de la tabla de resultados
    const numbers: number[] = [];
    const matches = html.match(/>\s*(\d{1,4})\s*</g) ?? [];
    for (const m of matches) {
      const n = parseInt(m.replace(/[><\s]/g, ""));
      if (!isNaN(n) && n >= 0 && n <= 9999) {
        numbers.push(n);
        if (numbers.length >= 20) break;
      }
    }
    return numbers.length > 0 ? numbers : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  // Verificar que es llamado por Vercel Cron (seguridad básica)
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const today = new Date().toISOString().split("T")[0];
  const dayOfWeek = new Date().getDay();

  // No correr fines de semana
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return NextResponse.json({ message: "Fin de semana, sin sorteos", date: today });
  }

  const supabase = getSupabaseAdmin();
  const results = { ok: 0, failed: 0, skipped: 0 };

  for (const sorteo of SORTEOS) {
    // Verificar si ya existe
    const { data: existing } = await supabase
      .from("draws")
      .select("id")
      .eq("draw_date", today)
      .eq("sorteo", sorteo)
      .single();

    if (existing) { results.skipped++; continue; }

    const numbers = await fetchSorteo(today, sorteo);
    if (!numbers || numbers.length === 0) { results.failed++; continue; }

    const draw: Record<string, string | number> = { draw_date: today, sorteo, source: "cron" };
    numbers.forEach((n, i) => { draw[`pos_${i + 1}`] = n; });

    const { error } = await supabase.from("draws").upsert(draw, { onConflict: "draw_date,sorteo" });
    if (error) { results.failed++; } else { results.ok++; }

    // Pequeña pausa entre requests
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log(`[Cron Scraper] ${today}: ${results.ok} ok, ${results.failed} failed, ${results.skipped} skipped`);

  return NextResponse.json({ date: today, ...results });
}
