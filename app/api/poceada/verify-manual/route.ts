/**
 * Verificación de predicciones Poceada Federal por game_id
 * No depende del turno exacto (Matutina/Nocturna/Poceada) — busca cualquier sorteo
 * oficial del día para el game_id de Poceada y compara.
 */
import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { getSupabaseAdmin } from '@/lib/supabase-client'
import logger from '@/lib/logger'
import { estadoFinal, normalizeTurno, posicionesDe, type DrawRow, type PredictionRow } from "@/lib/verificacion/criterio"
import { buildHistoryInsert } from "@/lib/verificacion/historial"

const GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()
  const fechaOverride = req.nextUrl.searchParams.get("date")
  const fecha = fechaOverride && /^\d{4}-\d{2}-\d{2}$/.test(fechaOverride)
    ? fechaOverride
    : new Date().toISOString().split("T")[0]

  try {
    const supabase = getSupabaseAdmin()

    // Buscar CUALQUIER sorteo oficial de Poceada para la fecha (independiente de turno/jurisdiccion)
    const { data: drawRows } = await supabase
      .from("draws")
      .select("date, turno, numbers, game_id")
      .eq("game_id", GAME_ID)
      .eq("date", fecha)
      .limit(5)

    if (!drawRows || drawRows.length === 0) {
      return NextResponse.json({ ok: false, reason: "No hay sorteo oficial de Poceada Federal para " + fecha }, { status: 200 })
    }

    // Tomar el primero disponible (matutina o nocturna)
    const predDraw = drawRows[0] as DrawRow

    // Buscar predicciones PENDING de Poceada para esa fecha
    const { data: preds } = await supabase
      .from("user_predictions")
      .select("id, user_id, date, turno, numeros")
      .eq("date", fecha)
      .or("turno.eq.Poceada,turno.ilike.%Poceada%")
      .or("status.eq.PENDING,status.is.null")

    const predictions = ((preds || []) as PredictionRow[]).filter(
      (p) => normalizeTurno(p.turno || "") === "poceada" || (p.turno || "").toLowerCase().includes("poceada"),
    )

    if (predictions.length === 0) {
      return NextResponse.json({ ok: true, verified: 0, reason: "Sin predicciones PENDING de Poceada para " + fecha, sorteo: predDraw.date })
    }

    const historyInserts = predictions.map((p) => buildHistoryInsert(p, predDraw))
    const { error: insertErr, data: inserted } = await supabase
      .from("prediction_history")
      .upsert(historyInserts, { onConflict: "prediction_id", ignoreDuplicates: true })
      .select("prediction_id, user_id, total_aciertos")

    if (insertErr) {
      logger.error("[poceada-verify-manual] upsert error", { error: insertErr.message })
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 })
    }

    // Actualizar status y aciertos
    let updated = 0
    for (const h of historyInserts) {
      const pred = predictions.find((p) => p.id === h.prediction_id)
      if (!pred) continue
      const estado = estadoFinal(h, true) // Poceada usa reglas especiales
      await supabase.from("user_predictions").update({
        status: estado,
        aciertos: posicionesDe(h),
        verified_at: new Date().toISOString(),
      }).eq("id", pred.id)
      updated++
    }

    return NextResponse.json({
      ok: true,
      fecha,
      sorteoUsado: predDraw.date,
      turnoSorteo: (predDraw as any)?.turno || "N/A",
      prediccionesVerificadas: updated,
      insertadas: (inserted || []).length,
    })
  } catch (e: any) {
    logger.error("[poceada-verify-manual] exception", { error: String(e), fecha })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
