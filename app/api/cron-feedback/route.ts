/**
 * Cron: Factor Weight Feedback Loop
 *
 * Runs after each draw (~15 min after scrape cron).
 * Evaluates factor accuracy and adjusts weights for the 12-factor ensemble.
 *
 * Called by Vercel Cron or cron-job.org.
 */

import { NextRequest, NextResponse } from "next/server"
import { evaluateAndAdjustWeights } from "@/lib/analisis/factor-feedback"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export const maxDuration = 120

function fechaArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric", month: "2-digit", day: "2-digit",
  }).format()
}

function turnoActualArgentina(): string {
  const now = new Date()
  const argStr = now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
  const argDate = new Date(argStr)
  const h = argDate.getHours()
  const m = argDate.getMinutes()
  const totalMin = h * 60 + m

  if (totalMin >= 600 && totalMin < 705) return "Previa"
  if (totalMin >= 705 && totalMin < 870) return "Primera"
  if (totalMin >= 870 && totalMin < 1050) return "Matutina"
  if (totalMin >= 1050 && totalMin < 1230) return "Vespertina"
  return "Nocturna"
}

async function hasDrawForTurno(fecha: string, turno: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from("draws")
      .select("id")
      .eq("date", fecha)
      .ilike("turno", turno)
      .limit(1)
    return Array.isArray(data) && data.length > 0
  } catch {
    return false
  }
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()

  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const fecha = fechaArgentina()
  const turnoParam = req.nextUrl.searchParams.get("turno")
  const turno = turnoParam || turnoActualArgentina()

  if (!["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"].includes(turno)) {
    return NextResponse.json({ error: `Turno inválido: ${turno}` }, { status: 400 })
  }

  // Check if draw exists for this turno
  const hasDraw = await hasDrawForTurno(fecha, turno)
  if (!hasDraw) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `No hay sorteo para ${turno} en ${fecha}`,
      elapsed_ms: Date.now() - t0,
    })
  }

  // Evaluate and adjust weights
  const result = await evaluateAndAdjustWeights(turno, fecha)

  logCronExecution("cron-feedback", {
    turno,
    fecha,
    evaluated: !!result,
    hitRate: result?.hitRate,
  }, t0)

  if (!result) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "No se pudo evaluar (sin datos de predicción o cache)",
      elapsed_ms: Date.now() - t0,
    })
  }

  return NextResponse.json({
    ok: true,
    turno: result.turno,
    fecha: result.fecha,
    hitRate: Math.round(result.hitRate * 100),
    factorAccuracies: Object.fromEntries(
      Object.entries(result.factorAccuracies).map(([k, v]) => [k, Math.round(v * 100)])
    ),
    weightsChanged: Object.keys(result.newWeights).some(
      k => result.newWeights[k as keyof typeof result.newWeights] !==
           result.previousWeights[k as keyof typeof result.previousWeights]
    ),
    elapsed_ms: Date.now() - t0,
  })
}
