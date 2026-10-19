/**
 * /api/cron-precompute
 *
 * Pre-computes predictions for all turnos and stores in predictions_cache.
 * Called by cron-job.org after each scrape, or manually, or by the aux ticker
 * (lib/cron/tareas-auxiliares.ts, gate 23 h) when no external trigger arrives.
 *
 * Flow:
 * 1. For each turno, run the full V6+V7+ML pipeline
 * 2. Store blended result in predictions_cache table
 * 3. Next GET /api/predictions reads from cache (< 200ms)
 *
 * El núcleo vive en lib/pipeline/precompute/lote-diario.ts (ejecutarLotePrecompute):
 * el route solo autentica, delega y devuelve el informe. La matemática/lógica
 * pura vive en lib/pipeline/precompute/ (blend, simulacion, persistencia,
 * omega-audit).
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { ejecutarLotePrecompute } from "@/lib/pipeline/precompute/lote-diario"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const turnoFilter = req.nextUrl.searchParams.get("turno")
  const result = await ejecutarLotePrecompute(turnoFilter, "route")

  return NextResponse.json(result)
}
