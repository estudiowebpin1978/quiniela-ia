import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

const SORTEOS_VALIDOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Todos"];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sorteo = searchParams.get("sorteo") ?? "Todos";
  const digits = parseInt(searchParams.get("digits") ?? "2");
  const userId = searchParams.get("userId");

  if (!SORTEOS_VALIDOS.includes(sorteo)) {
    return NextResponse.json({ error: "sorteo inválido" }, { status: 400 });
  }
  if (![2, 3, 4].includes(digits)) {
    return NextResponse.json({ error: "digits debe ser 2, 3 o 4" }, { status: 400 });
  }

  // Verificar premium para 3-4 dígitos
  if (digits > 2) {
    if (!userId) {
      return NextResponse.json({ error: "Autenticación requerida", upgrade: true }, { status: 401 });
    }
    const supabase = getSupabaseAdmin();
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role,premium_until")
      .eq("id", userId)
      .single();
    const active =
      profile?.role === "admin" ||
      (profile?.role === "premium" && profile?.premium_until && new Date(profile.premium_until) > new Date());
    if (!active) {
      return NextResponse.json({ error: "Premium requerido", upgrade: true }, { status: 403 });
    }
  }

  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0];

    const cols = Array.from({ length: 20 }, (_, i) => `pos_${i + 1}`).join(",");
    let query = supabase.from("draws").select(cols).gte("draw_date", since);
    if (sorteo !== "Todos") query = query.eq("sorteo", sorteo);

    const { data: draws, error } = await query;
    if (error) throw error;

    // Calcular frecuencias 2D
    const freq = Array(100).fill(0);
    const first = Array(100).fill(0);
    for (const d of draws ?? []) {
      for (let i = 1; i <= 20; i++) {
        const v = (d as unknown as Record<string, number>)[`pos_${i}`];
        if (v != null) {
          const twoD = v % 100;
          freq[twoD]++;
          if (i === 1) first[twoD]++;
        }
      }
    }
    const total = freq.reduce((a: number, b: number) => a + b, 0) || 1;
    const frequencyData = freq.map((count: number, num: number) => ({
      num,
      total_appearances: count,
      first_place_count: first[num],
      frequency_ratio: count / total,
    }));

    // Predicciones
    const scored = frequencyData
      .map((r: { num: number; total_appearances: number; first_place_count: number }) => ({
        num: r.num,
        score: r.total_appearances + r.first_place_count * 3,
      }))
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .slice(0, 10);

    const predictions = digits === 2
      ? scored.slice(0, 5).map((x: { num: number }) => String(x.num).padStart(2, "0"))
      : digits === 3
      ? scored.slice(0, 5).map((x: { num: number }, i: number) => String(((i * 3 + 1) % 10) * 100 + x.num).padStart(3, "0"))
      : scored.slice(0, 5).map((x: { num: number }, i: number) => String(((i * 7 + 13) % 100) * 100 + x.num).padStart(4, "0"));

    // Log de predicción
    if (userId) {
      supabase.from("prediction_logs").insert({ user_id: userId, digits, sorteo, predictions }).then(() => {});
    }

    return NextResponse.json({
      predictions,
      frequencyData,
      totalDraws: draws?.length ?? 0,
      sorteo,
      digits,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[/api/predictions]", err);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
