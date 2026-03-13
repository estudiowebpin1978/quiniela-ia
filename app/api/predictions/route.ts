import { NextRequest, NextResponse } from "next/server";

const SORTEOS_VALIDOS = ["Previa","Primera","Matutina","Vespertina","Nocturna","Todos"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get("sorteo") ?? "Todos";
  if (!SORTEOS_VALIDOS.includes(sorteo))
    return NextResponse.json({ error: "sorteo inválido" }, { status: 400 });

  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/"/g,"").trim();
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/"/g,"").trim();

  if (!SB_URL || !SB_KEY)
    return NextResponse.json({ error: "Variables de entorno no configuradas" }, { status: 500 });

  const since = new Date(Date.now() - 365*86400000).toISOString().split("T")[0];

  let url = `${SB_URL}/rest/v1/draws?select=*&draw_date=gte.${since}&order=draw_date.desc`;
  if (sorteo !== "Todos") url += `&sorteo=eq.${encodeURIComponent(sorteo)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(url, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `DB error: ${err}` }, { status: 500 });
    }

    const draws = await res.json();

    if (!draws || draws.length === 0) {
      return NextResponse.json({
        predictions: [], predictions3d: [], predictions4d: [],
        redoblona: [], frequencyData: [], totalDraws: 0, sorteo,
        message: "Sin datos. Ejecutá: python scripts/ingest_ruta1000.py --days 30"
      });
    }

    // Calcular frecuencias
    const freq = Array(100).fill(0);
    const first = Array(100).fill(0);
    const redoblonaCount: Record<number,number> = {};

    for (const d of draws) {
      const seen = new Set<number>();
      for (let i = 1; i <= 20; i++) {
        const v = d[`pos_${i}`];
        if (v == null) continue;
        const n = Number(v) % 100;
        freq[n]++;
        if (i === 1) first[n]++;
        if (seen.has(n)) redoblonaCount[n] = (redoblonaCount[n] ?? 0) + 1;
        seen.add(n);
      }
    }

    const total = freq.reduce((a,b) => a+b, 0) || 1;
    const frequencyData = freq.map((count,num) => ({
      num, total_appearances: count,
      first_place_count: first[num],
      frequency_ratio: count/total,
    }));

    const scored = frequencyData
      .map(r => ({ num: r.num, score: r.total_appearances + r.first_place_count * 3 }))
      .sort((a,b) => b.score - a.score);

    const top5 = scored.slice(0,5);
    const pad = (n:number,l=2) => String(n).padStart(l,"0");

    const predictions   = top5.map(x => pad(x.num));
    const predictions3d = top5.map((x,i) => pad(((i*3+1)%10)*100 + x.num, 3));
    const predictions4d = top5.map((x,i) => pad(((i*7+13)%100)*100 + x.num, 4));

    const redoblona = Object.entries(redoblonaCount)
      .map(([n,c]) => ({ num: pad(parseInt(n)), redoblonaCount: c, totalFreq: freq[parseInt(n)] }))
      .sort((a,b) => b.redoblonaCount - a.redoblonaCount)
      .slice(0,5);

    return NextResponse.json({
      predictions, predictions3d, predictions4d,
      redoblona, frequencyData,
      totalDraws: draws.length, sorteo,
      generatedAt: new Date().toISOString(),
    });

  } catch (e: unknown) {
    clearTimeout(timeout);
    const msg = (e as Error)?.name === "AbortError"
      ? "Supabase no responde (timeout 12s)"
      : (e as Error).message;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
