/**
 * Evaluación de factores V6 por sorteo
 *
 * Tras cada sorteo oficial, mide qué tan bien discriminó cada factor del
 * motor V6 (omega) entre los números que acertaron y los que fallaron:
 *
 *   ratio(factor) = promedio(atribución en aciertos) / promedio(atribución en fallos)
 *
 * ratio 1.0 = neutral (no discriminó), > 1 = favoreció a los aciertos,
 * < 1 = favoreció a los fallos. Se guarda en `factor_weight_history`
 * (`factor_accuracies` en jsonb, ratios 0.1–2.0) para alimentar la sección
 * "Rendimiento por Factor" de /rendimiento.
 *
 * La atribución por número vive en
 * `predictions_cache.numeros_2[].factor_attribution` (escrita por
 * cron-run / cron-precompute desde el motor omega_v6).
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

/** Factores V6 del motor omega (orden de presentación en /rendimiento). */
export const V6_FACTORS = [
  "frequency", "hot", "cold", "gap", "trend",
  "markov", "pattern", "positional", "cooccurrence", "bayesian",
] as const

const MIN_RATIO = 0.1
const MAX_RATIO = 2.0
/** Mínimo de números con atribución V6 para publicar una evaluación. */
const MIN_SAMPLES = 3

export interface FactorEvaluation {
  turno: string
  fecha: string
  /** Aciertos del Top10 vs el sorteo oficial (0–1). */
  hitRate: number
  /** Ratio por factor (0.1–2.0; 1.0 = neutral). */
  factorAccuracies: Record<string, number>
  /** Números con atribución V6 evaluados. */
  samples: number
}

interface CachedItem {
  n?: number | string
  numero?: number | string
  factor_attribution?: Record<string, number> | null
}

/** Normaliza cualquier número al dominio 0–99 de la quiniela/poceada. */
const norm100 = (n: number): number => ((Math.trunc(n) % 100) + 100) % 100

/**
 * Evalúa los factores V6 de la predicción de (turno, fecha) contra el
 * sorteo oficial y registra/reescribe la fila en factor_weight_history.
 * Devuelve null cuando no hay datos suficientes (sin predicción, sin
 * sorteo o sin atribución). Idempotente por (turno, fecha).
 */
export async function evaluateV6Factors(
  turno: string,
  fecha: string,
  dbArg?: SupabaseClient,
): Promise<FactorEvaluation | null> {
  try {
    const supabase = dbArg ?? getSupabaseAdmin()

    // 1. Predicción del motor para ese turno/fecha
    const { data: cacheRows, error: cacheErr } = await supabase
      .from("predictions_cache")
      .select("numeros_2")
      .eq("date", fecha)
      .eq("turno", turno)
      .order("computed_at", { ascending: false })
      .limit(1)

    if (cacheErr) {
      logger.warn("factor-evaluation: predictions_cache read failed", { turno, fecha, error: cacheErr.message })
      return null
    }
    const items = (Array.isArray(cacheRows) && cacheRows[0]?.numeros_2
      ? cacheRows[0].numeros_2
      : null) as CachedItem[] | null
    if (!Array.isArray(items) || items.length === 0) return null

    // 2. Sorteo oficial del turno
    const { data: drawRows } = await supabase
      .from("draws")
      .select("numbers")
      .eq("date", fecha)
      .eq("turno", turno)
      .limit(1)

    const drawNums = Array.isArray(drawRows) && drawRows[0]?.numbers?.length
      ? (drawRows[0].numbers as number[])
      : null
    if (!drawNums) return null
    const actual = new Set(drawNums.map((n) => norm100(Number(n))))

    // 3. Números con atribución V6 (los números aportados por V7/ML sin
    //    atribución no cuentan para la métrica por factor)
    const attributed = items
      .map((it) => ({ n: Number(it.n ?? it.numero), fa: it.factor_attribution }))
      .filter((x): x is { n: number; fa: Record<string, number> } =>
        Number.isFinite(x.n) && !!x.fa && typeof x.fa === "object" && Object.keys(x.fa).length > 0)

    if (attributed.length < MIN_SAMPLES) return null

    // 4. Aciertos del Top10 completo (incluye números sin atribución)
    let topHits = 0
    for (const it of items) {
      const n = Number(it.n ?? it.numero)
      if (Number.isFinite(n) && actual.has(norm100(n))) topHits++
    }
    // Sin ningún acierto no hay contraste acierto/fallo: la métrica por
    // factor es indefinida (no se registra la evaluación).
    if (topHits === 0) return null
    const hitRate = topHits / items.length

    // 5. Promedios de atribución por factor: aciertos vs fallos
    const sumHit: Record<string, number> = {}
    const cntHit: Record<string, number> = {}
    const sumMiss: Record<string, number> = {}
    const cntMiss: Record<string, number> = {}

    for (const { n, fa } of attributed) {
      const isHit = actual.has(norm100(n))
      const sum = isHit ? sumHit : sumMiss
      const cnt = isHit ? cntHit : cntMiss
      for (const [k, raw] of Object.entries(fa)) {
        const v = Number(raw)
        if (!Number.isFinite(v)) continue
        sum[k] = (sum[k] || 0) + v
        cnt[k] = (cnt[k] || 0) + 1
      }
    }

    // 6. Ratio por factor (clamp 0.1–2.0), solo factores presentes en los datos
    const factorAccuracies: Record<string, number> = {}
    for (const k of new Set([...Object.keys(sumHit), ...Object.keys(sumMiss)])) {
      const avgHit = cntHit[k] ? sumHit[k] / cntHit[k] : 0
      const avgMiss = cntMiss[k] ? sumMiss[k] / cntMiss[k] : 0
      // Si los fallos no tuvieron atribución para este factor, la
      // discriminación fue perfecta (todo el peso cayó en aciertos).
      const ratio = avgMiss > 0 ? avgHit / avgMiss : (avgHit > 0 ? MAX_RATIO : MIN_RATIO)
      factorAccuracies[k] = Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
    }
    if (Object.keys(factorAccuracies).length === 0) return null

    // 7. Guardar (idempotente: reemplaza la evaluación previa del par)
    const { error: delErr } = await supabase
      .from("factor_weight_history")
      .delete()
      .eq("turno", turno)
      .eq("evaluation_date", fecha)
    if (delErr) {
      logger.warn("factor-evaluation: delete prev failed", { turno, fecha, error: delErr.message })
    }

    const { error: insErr } = await supabase.from("factor_weight_history").insert({
      turno,
      evaluation_date: fecha,
      hit_rate: Math.round(hitRate * 1000) / 1000,
      factor_accuracies: factorAccuracies,
      draws_evaluated: 1,
    })
    if (insErr) {
      logger.error("factor-evaluation: insert failed", { turno, fecha, error: insErr.message })
      return null
    }

    logger.info("factor-evaluation: saved", {
      turno, fecha, hitRate: Math.round(hitRate * 100), samples: attributed.length,
      factores: Object.keys(factorAccuracies).length,
    })
    return { turno, fecha, hitRate, factorAccuracies, samples: attributed.length }
  } catch (e) {
    logger.warn("factor-evaluation: failed", { turno, fecha, error: String(e) })
    return null
  }
}

/**
 * Evalúa solo si aún no existe una fila de factor_weight_history para
 * (turno, fecha). Barato cuando la fila ya existe (una sola lectura).
 */
export async function ensureFactorHistory(
  turno: string,
  fecha: string,
  dbArg?: SupabaseClient,
): Promise<FactorEvaluation | null> {
  try {
    const supabase = dbArg ?? getSupabaseAdmin()
    const { data } = await supabase
      .from("factor_weight_history")
      .select("id")
      .eq("turno", turno)
      .eq("evaluation_date", fecha)
      .limit(1)
    if (Array.isArray(data) && data.length > 0) return null
    return await evaluateV6Factors(turno, fecha, supabase)
  } catch (e) {
    logger.warn("factor-evaluation: ensure failed", { turno, fecha, error: String(e) })
    return null
  }
}
