/**
 * /api/ct-backtest
 *
 * Backtest out-of-sample del motor cross-turno (CT) contra el baseline de
 * frecuencia del turno. Replay real: para cada día objetivo usa SOLO los
 * sorteos estrictamente anteriores (mismo criterio anti-fuga que en
 * producción, ver lib/analisis/cross-turno.ts).
 *
 * NO escribe en la BD: devuelve métricas hit@1 / hit@5 / hit@10 (la cabeza
 * del sorteo real dentro del ranking) comparando:
 *   - CT (cadena cross-turno)
 *   - baseline frecuencia de cabeza del propio turno
 *
 * Decisión Regla Omega: si el uplift no es consistente (≥60% de los turnos
 * con mejora y media del uplift > 0), el engineWeights.CT se queda en 0.
 *
 * GET ?dias=120&secret=... (auth por validateCronAuth; requiere service).
 */

import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse } from "@/lib/cron/auth"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { predecirCrossTurno, ORDEN_TURNO, type DrawCronologico } from "@/lib/analisis/cross-turno"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

interface SorteoRow {
  date: string
  turno: string
  numbers: number[] | null
}

/** Hit@k: ¿la cabeza real (mod 100) está en el top-k del ranking? */
function hitAtK(ranking: number[], cabezaReal: number, k: number): boolean {
  const s = ranking.slice(0, k).map((n) => n % 100)
  return s.includes(cabezaReal)
}

function rankingDesdeScores(scores: Map<number, number>): number[] {
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([n]) => n)
}

function rankingFrecuencia(previos: DrawCronologico[]): number[] {
  const freq = new Map<number, number>()
  for (const d of previos) {
    if (Array.isArray(d.numbers) && d.numbers.length > 0) {
      const cabeza = d.numbers[0] % 100
      freq.set(cabeza, (freq.get(cabeza) || 0) + 1)
    }
  }
  return rankingDesdeScores(freq)
}

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const dias = Math.min(parseInt(req.nextUrl.searchParams.get("dias") || "120", 10), 365)
  const supabase = getSupabaseAdmin()

  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: rows, error } = await supabase
    .from("draws")
    .select("date, turno, numbers")
    .eq("jurisdiccion", "CABA")
    .gte("date", "2026-01-01")
    .order("date", { ascending: true })

  if (error || !rows) {
    return NextResponse.json({ ok: false, error: error?.message ?? "sin datos" }, { status: 500 })
  }

  const sorteos = rows as SorteoRow[]
  const historico: DrawCronologico[] = sorteos
    .filter((r) => Array.isArray(r.numbers) && r.numbers.length > 0)
    .map((r) => ({ fecha: r.date, turno: r.turno, numbers: r.numbers as number[] }))

  // Solo días objetivo dentro de la ventana OOS pedida.
  const fechasObjetivo = [...new Set(historico.filter((d) => d.fecha >= desde).map((d) => d.fecha))].sort()

  const porTurno: Record<string, {
    dias: number
    ct: { h1: number; h5: number; h10: number }
    base: { h1: number; h5: number; h10: number }
  }> = {}

  for (const fecha of fechasObjetivo) {
    for (const turno of Object.keys(ORDEN_TURNO)) {
      const real = historico.find((d) => d.fecha === fecha && d.turno === turno)
      if (!real || !Array.isArray(real.numbers) || real.numbers.length === 0) continue
      const cabezaReal = real.numbers[0] % 100

      const ctScores = predecirCrossTurno(historico, fecha, turno)
      if (ctScores.size === 0) continue

      const anteriores = historico.filter((d) =>
        d.fecha < fecha || (d.fecha === fecha && (ORDEN_TURNO[d.turno] ?? 99) < ORDEN_TURNO[turno]),
      )
      if (anteriores.length < 30) continue

      const ctRanking = rankingDesdeScores(ctScores)
      const baseRanking = rankingFrecuencia(anteriores)

      const stats = porTurno[turno] ||= {
        dias: 0,
        ct: { h1: 0, h5: 0, h10: 0 },
        base: { h1: 0, h5: 0, h10: 0 },
      }
      stats.dias += 1
      for (const k of [1, 5, 10] as const) {
        if (hitAtK(ctRanking, cabezaReal, k)) stats.ct[`h${k}`] += 1
        if (hitAtK(baseRanking, cabezaReal, k)) stats.base[`h${k}`] += 1
      }
    }
  }

  const informe = Object.entries(porTurno).map(([turno, s]) => ({
    turno,
    diasEvaluados: s.dias,
    ct: { h1: s.ct.h1 / s.dias, h5: s.ct.h5 / s.dias, h10: s.ct.h10 / s.dias },
    baseline: { h1: s.base.h1 / s.dias, h5: s.base.h5 / s.dias, h10: s.base.h10 / s.dias },
    upliftH10: (s.ct.h10 - s.base.h10) / s.dias,
  }))

  const conDias = informe.filter((i) => i.diasEvaluados > 0)
  const mediaUplift = conDias.length > 0 ? conDias.reduce((acc, i) => acc + i.upliftH10, 0) / conDias.length : 0
  const turnosMejor = conDias.filter((i) => i.upliftH10 > 0).length

  const resultado = {
    ok: true,
    ventanalDesde: desde,
    diasEvaluados: fechasObjetivo.length,
    porTurno: informe,
    resumen: {
      mediaUpliftH10: Math.round(mediaUplift * 10000) / 10000,
      turnosConMejora: `${turnosMejor}/${conDias.length}`,
      veredictoReglaOmega: turnosMejor / Math.max(1, conDias.length) >= 0.6 && mediaUplift > 0
        ? "VALIDADO — habilitar CT con peso pequeño"
        : "NO VALIDADO — CT se mantiene con peso 0 (no se promete mejora)",
    },
    generado: new Date().toISOString(),
  }

  logger.info("[ct-backtest] evaluación OOS completa", { turnoEvaluados: conDias.length })
  return NextResponse.json(resultado)
}
