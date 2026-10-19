/**
 * /api/walkforward-backtest
 *
 * Walk-forward OOS por chunks reanudables: para cada fecha de test usa SOLO
 * los sorteos anteriores (V6 RPC con p_date, V7 con asOf, ML re-entrenado
 * por chunk — anti-fuga frente D). Persiste en walkforward_results
 * (idempotente) y avanza el cursor en walkforward_progress.
 *
 * El núcleo vive en lib/walkforward/lote-chunk.ts (ejecutarChunkWalkforward);
 * el route solo autentica y delega. El ticker auxiliar lo invoca con la misma
 * función, así el historial OOS se mantiene al día sin depender de corridas
 * manuales.
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth } from "@/lib/cron/auth"
import { ejecutarChunkWalkforward } from "@/lib/walkforward/lote-chunk"

export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return NextResponse.json({ error: auth.reason || "Unauthorized" }, { status: 403 })

  const turno = req.nextUrl.searchParams.get("turno")
  const chunkSizeParm = parseInt(req.nextUrl.searchParams.get("chunk_size") || "30")
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0")

  const results = await ejecutarChunkWalkforward(turno, chunkSizeParm, offset)

  return NextResponse.json({ ok: true, mode: "chunked_walkforward", chunk_size: chunkSizeParm, offset, results })
}
