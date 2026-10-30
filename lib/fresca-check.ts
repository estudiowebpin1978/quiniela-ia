/**
 * Verificación automática de frescura de predicciones.
 * Requiere conexión a Supabase (usa getSupabaseAdmin si se importa).
 * No inventa predicciones: solo compara existing predictions_cache
 * contra draws para detectar turnos que deberían tener cache
 * pero faltan (antes de su sorteo).
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"

export async function verificarFrescaPredicciones() {
  const supabase = getSupabaseAdmin()
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

  const faltantes: Array<{ turno: string; fecha: string; estado: string }> = []

  for (const turno of turnos) {
    const { data: cache } = await supabase
      .from("predictions_cache")
      .select("computed_at")
      .eq("turno", turno)
      .eq("date", hoy)
      .limit(1)
      .single()

    const { data: draw } = await supabase
      .from("draws")
      .select("date, turno")
      .eq("turno", turno)
      .eq("jurisdiccion", turno === "Poceada" ? "ciudad" : "CABA")
      .gte("date", hoy)
      .order("date", { ascending: true })
      .limit(1)
      .single()

    // Si hay sorteo hoy o mañana y no hay cache fresco (< 2h antes de sorteo)
    if (draw && (!cache || !cache.computed_at || Date.now() - new Date(cache.computed_at).getTime() > 2 * 60 * 60 * 1000)) {
      faltantes.push({ turno, fecha: hoy, estado: "FALTA_PREDICION" })
    }
  }

  return {
    hoy,
    turnosVerificados: turnos.length,
    faltantes,
    status: faltantes.length === 0 ? "FRESCO" : "FALTA_CACHE",
  }
}
