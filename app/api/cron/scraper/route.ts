import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
const SORTEOS = ["Previa","Primera","Matutina","Vespertina","Nocturna"];
export async function GET(req: NextRequest) {
  const today = new Date().toISOString().split("T")[0];
  const day = new Date().getDay();
  if (day === 0 || day === 6) return NextResponse.json({ message: "Fin de semana" });
  const supabase = getSupabaseAdmin();
  let ok = 0;
  for (const sorteo of SORTEOS) {
    const url = `https://quinielanacional.ruta1000.com.ar/quiniela-nacional/${today.replace(/-/g,"/")}/${sorteo.toLowerCase()}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "QuinielaIA/1.0" }, signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const html = await res.text();
      const nums: number[] = [];
      for (const m of html.matchAll(/>(\d{1,4})</g)) {
        const n = parseInt(m[1]);
        if (n >= 0 && n <= 9999) { nums.push(n); if (nums.length >= 20) break; }
      }
      if (nums.length === 0) continue;
      const draw: Record<string,string|number> = { draw_date: today, sorteo, source: "cron" };
      nums.forEach((n,i) => { draw[`pos_${i+1}`] = n; });
      await supabase.from("draws").upsert(draw, { onConflict: "draw_date,sorteo" });
      ok++;
    } catch {}
    await new Promise(r => setTimeout(r, 1200));
  }
  return NextResponse.json({ date: today, ok });
}
