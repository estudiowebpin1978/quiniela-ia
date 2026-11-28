/**
 * Cron auxiliar: tareas pesadas (vencimientos Premium, precompute, ML training,
 * walk-forward, verify-catchup) acopladas con gate de frecuencia propio.
 *
 * Aisladas en su propia invocación para no competir por el presupuesto de CPU
 * (10 ms) ni de subrequests (50) del cron de verificación (/api/cron-verify).
 */
import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { ejecutarTareasAuxiliares } from "@/lib/cron/tareas-auxiliares"
import logger from "@/lib/logger"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authResult = await validateCronAuth(req)
  if (!authResult.authorized) return unauthorizedResponse()

  const t0 = Date.now()
  try {
    const informe = await ejecutarTareasAuxiliares()
    logCronExecution("cron-aux", { origen: "cron-aux", ...informe }, t0)
    return NextResponse.json({ ok: true, ...informe, durationMs: Date.now() - t0 })
  } catch (e) {
    logger.warn("[cron-aux] falló", { error: String(e) })
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
