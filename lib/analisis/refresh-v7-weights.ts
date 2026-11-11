import { getSupabaseAdmin } from "@/lib/supabase-client"
import { adjustV7Weights } from "@/lib/analisis/v7-weights"

// Ejecutar actualización de pesos V7 con datos reales verificados
// Se invoca manualmente con el último sorteo confirmado (2026-10-24)
// para romper el bloqueo de 19 días y validar que el loop funciona.

export async function refrescarPesosV7(turno: string) {
  const sb = getSupabaseAdmin()
  try {
    // Obtener predicción más reciente del turno para comparar
    const { data: predRow } = await sb
      .from("predictions_cache")
      .select("numeros_2, numeros_3, numeros_4, confianza")
      .eq("turno", turno)
      .eq("date", new Date().toISOString().slice(0, 10))
      .order("computed_at", { ascending: false })
      .limit(1)
      .single()

    // Obtener resultado oficial del último sorteo verificado
    const { data: drawRow } = await sb
      .from("draws")
      .select("numbers")
      .eq("turno", turno)
      .in("jurisdiccion", turno === "Poceada" ? ["ciudad"] : ["CABA"])
      .order("date", { ascending: false })
      .limit(1)
      .single()

    if (!predRow || !drawRow) return { ok: false, error: "faltan datos verificados" }

    const actualNums = (drawRow.numbers || []).map((n: number) => n % 100)
    const predictedTop10 = (predRow.numeros_2 as Array<{ num: number; numero?: string }> || [])
      .slice(0, 10)
      .map((n: unknown) => (typeof n === "number" ? n : (n as { numero?: string }).numero))
      .filter((n): n is number => typeof n === "number")

    const factoresVacios = { survival: 0, correlation: 0, spacing: 0, frequency: 0, recency: 0, markov: 0, cycles: 0, temporal: 0, debt: 0, bayesian: 0 }
    const result = await adjustV7Weights(turno, predictedTop10.map((n: number) => ({ numero: String(n).padStart(2, "0"), factors: factoresVacios })), actualNums)
    return { ok: true, result }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}
