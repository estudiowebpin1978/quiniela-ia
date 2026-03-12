import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const SORTEOS_VALIDOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Todos"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get("sorteo") ?? "Todos";

  if (!SORTEOS_VALIDOS.includes(sorteo)) {
    return NextResponse.json({ error: "sorteo inválido" }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    // Seleccionar con * para evitar problemas de columnas faltantes
    let query = supabase
      .from("draws")
      .select("*")
      .gte("draw_date", since)
      .order("draw_date", { ascending: false });

    if (sorteo !== "Todos") query = query.eq("sorteo", sorteo);

    const { data: draws, error } = await query;

    if (error) {
      console.error("[predictions] Supabase error:", JSON.stringify(error));
      return NextResponse.json(
        { error: `DB error: ${error.message}`, code: error.code },
        { status: 500 }
      );
    }

    if (!draws || draws.length === 0) {
      return NextResponse.json({
        predictions: [],
        frequencyData: [],
        redoblona: [],
        totalDraws: 0,
        sorteo,
        message: "Sin datos. Ejecutá el scraper: python scripts/ingest_ruta1000.py --days 30",
      });
    }

    // ── Frecuencias ──────────────────────────────────────────────────────────
    const freq = Array(100).fill(0);
    const first = Array(100).fill(0);
    // Para redoblona: contar cuántas veces un número apareció en múltiples posiciones del mismo sorteo
    const redoblonaCount: Record<number, number> = {};

    for (const d of draws) {
      const numsCounted = new Set<number>();
      for (let i = 1; i <= 20; i++) {
        const v = d[`pos_${i}`];
        if (v == null) continue;
        const twoD = Number(v) % 100;
        freq[twoD]++;
        if (i === 1) first[twoD]++;
        // Redoblona: número que ya apareció antes en este sorteo
        if (numsCounted.has(twoD)) {
          redoblonaCount[twoD] = (redoblonaCount[twoD] ?? 0) + 1;
        }
        numsCounted.add(twoD);
      }
    }

    const total = freq.reduce((a, b) => a + b, 0) || 1;
    const frequencyData = freq.map((count, num) => ({
      num,
      total_appearances: count,
      first_place_count: first[num],
      frequency_ratio: count / total,
    }));

    // ── Predicciones 2D ──────────────────────────────────────────────────────
    const scored = frequencyData
      .map(r => ({ num: r.num, score: r.total_appearances + r.first_place_count * 3 }))
      .sort((a, b) => b.score - a.score);

    const top5 = scored.slice(0, 5);
    const predictions = top5.map(x => String(x.num).padStart(2, "0"));

    // ── Predicciones 3D y 4D (para usuarios premium) ─────────────────────────
    const predictions3d = top5.map((x, i) =>
      String(((i * 3 + 1) % 10) * 100 + x.num).padStart(3, "0"));
    const predictions4d = top5.map((x, i) =>
      String(((i * 7 + 13) % 100) * 100 + x.num).padStart(4, "0"));

    // ── Redoblona: números más frecuentes en repetirse en mismo sorteo ────────
    const redoblonaList = Object.entries(redoblonaCount)
      .map(([num, count]) => ({ num: parseInt(num), redoblonaCount: count, totalFreq: freq[parseInt(num)] }))
      .sort((a, b) => b.redoblonaCount - a.redoblonaCount)
      .slice(0, 5)
      .map(x => ({
        num: String(x.num).padStart(2, "0"),
        redoblonaCount: x.redoblonaCount,
        totalFreq: x.totalFreq,
      }));

    return NextResponse.json({
      predictions,
      predictions3d,
      predictions4d,
      redoblona: redoblonaList,
      frequencyData,
      totalDraws: draws.length,
      sorteo,
      generatedAt: new Date().toISOString(),
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[/api/predictions] catch:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
