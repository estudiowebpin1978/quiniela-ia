/**
 * Persistencia del precompute: lecturas de soporte (histórico, RPCs de scores
 * 2/3/4 cifras, log de predicciones por motor) y escritura en
 * predictions_cache.
 *
 * Extraído de app/api/cron-precompute/route.ts. Los casts `as never` de las
 * llamadas rpc()/schema() se mantienen tal cual.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { logEnginePredictions } from "@/lib/ensemble/meta-ensemble"
import { SUENOS } from "@/lib/suenos"
import { redondear } from "@/lib/pipeline/precompute/blend"
import type { BlendedPrediction, EngineWeights } from "@/lib/pipeline/precompute/blend"
import type { Draw } from "@/lib/analisis/engine-v7"
import type { MonteCarloResultado } from "@/lib/analisis/monte-carlo"
import logger from "@/lib/logger"

/** Filas genéricas devueltas por las RPCs de scores. */
export type Filas = Array<Record<string, unknown>>

/**
 * Histórico COMPLETO del turno con fecha estrictamente anterior a hoy,
 * ordenado ascendente por fecha.
 *
 * Antes: .lte("id", lastDrawId) — los id son UUIDs aleatorios, así que el
 * filtro dejaba un subconjunto arbitrario (~50%) del histórico y cambiaba
 * entre corridas (inestabilidad) además de filtrar de forma no determinista.
 */
export async function cargarHistorico(
  supabase: SupabaseClient,
  turno: string,
  gameId: string,
  today: string,
): Promise<Draw[] | null> {
  const { data: histDraws } = await supabase
    .from("draws")
    .select("id, date, turno, numbers")
    .eq("turno", turno)
    .eq("game_id", gameId)
    .lt("date", today)
    .order("date", { ascending: true })

  if (!histDraws) return null

  return histDraws.map((d: Record<string, unknown>) => ({
    fecha: d.date as string,
    turno: d.turno as string,
    numbers: d.numbers as number[],
  }))
}

/**
 * Run V6 (SQL RPC). Devuelve las filas (o null) y loguea el error sin bloquear.
 */
export async function ejecutarV6(
  supabase: SupabaseClient,
  turno: string,
  today: string,
): Promise<Filas | null> {
  const { data: v6Rows, error: v6RpcErr } = await supabase.rpc("calculate_omega_v6", {
    p_turno: turno,
    p_tier: "free",
    p_date: today,
  })
  if (v6RpcErr) {
    logger.warn("[cron-precompute] V6 RPC error", { turno, error: JSON.stringify(v6RpcErr) })
  }
  return v6Rows as Filas | null
}

/**
 * Log de predicciones crudas de cada motor (antes del blend) contra el sorteo
 * de HOY de este turno (si ya existe el resultado): alimenta
 * engine_predictions_log → recalculate_engine_performance → pesos dinámicos.
 */
export async function registrarPrediccionesMotor(
  supabase: SupabaseClient,
  params: {
    turno: string
    gameId: string
    today: string
    numeros: { v6: number[]; v7: number[]; ml: number[] }
    /** Lineage del run (seed + versiones) — ver lineageDelRun(). */
    lineage?: import("@/lib/ensemble/meta-ensemble").LineageInfo
  },
): Promise<void> {
  const { turno, gameId, today, numeros, lineage } = params
  try {
    const { data: todayDraw } = await supabase
      .from("draws")
      .select("id")
      .eq("turno", turno)
      .eq("date", today)
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (todayDraw?.id) {
      await logEnginePredictions(todayDraw.id as string, turno, numeros.v6, numeros.v7, numeros.ml, lineage)
    }
  } catch { /* non-fatal — don't crash the turno for logging failures */ }
}

/**
 * Candidatos 3/4 cifras: V6 puntúa los 1000 / 10000 números posibles
 * (dos RPC en paralelo). Devuelve las filas crudas; los errores se loguean
 * sin bloquear.
 */
export async function scoreCifrasV6(
  supabase: SupabaseClient,
  turno: string,
  today: string,
): Promise<{ tres: Filas | null; cuatro: Filas | null }> {
  const [v6_3rows, v6_4rows] = await Promise.all([
    supabase.rpc("score_numbers_v6" as never, {
      p_turno: turno,
      p_date: today,
      p_digit_space: "3",
      p_modulus: 1000,
      p_series_start: 0,
      p_series_end: 999,
    } as never),
    supabase.rpc("score_numbers_v6" as never, {
      p_turno: turno,
      p_date: today,
      p_digit_space: "4",
      p_modulus: 10000,
      p_series_start: 0,
      p_series_end: 9999,
    } as never),
  ])

  if (v6_3rows.error) logger.warn("[cron-precompute] 3 cifras RPC error", { turno, error: String(v6_3rows.error) })
  if (v6_4rows.error) logger.warn("[cron-precompute] 4 cifras RPC error", { turno, error: String(v6_4rows.error) })

  return { tres: v6_3rows.data as Filas | null, cuatro: v6_4rows.data as Filas | null }
}

export interface ParamsCache {
  gameId: string
  date: string
  turno: string
  /** Top-10 diversificado con MMR (2 cifras) */
  blendedDiversified: BlendedPrediction[]
  numeros_3: string[]
  numeros_4: string[]
  redoblona: { cabeza: string; acompanante: string } | null
  engineWeights: EngineWeights
  /** consistencia del modelo (NO probabilidad de acierto), sin redondear */
  confidence: number
  agreement: number
  monteCarlo: MonteCarloResultado | null
}

/** Guarda el resultado del turno en predictions_cache (RPC del schema api). */
export async function upsertPredictionsCache(
  supabase: SupabaseClient,
  params: ParamsCache,
): Promise<void> {
  const { gameId, date, turno, blendedDiversified, numeros_3, numeros_4, redoblona, engineWeights, confidence, agreement, monteCarlo } = params

  const { error: upsertError } = await supabase.schema("api").rpc("predictions_cache_upsert" as never, {
    p_game_id: gameId,
    p_date: date,
    p_turno: turno,
    p_numeros_2: blendedDiversified.map((p) => ({
      n: p.n,
      numero: p.numero,
      score: redondear(p.score, 3),
      emoji: getEmoji(p.n),
      significado: getSignificado(p.n),
      factor_attribution: p.factor_attribution,
    })),
    p_numeros_3: numeros_3,
    p_numeros_4: numeros_4,
    p_redoblona: redoblona,
    p_engine_version: "meta-ensemble-v1",
    p_v6_weight: redondear(engineWeights.V6, 4),
    p_v7_weight: redondear(engineWeights.V7, 4),
    p_ml_weight: redondear(engineWeights.ML, 4),
    // confidence = consistencia del modelo (NO probabilidad de acierto;
    // el tipo es fijo en código: "model_consistency")
    p_confidence: redondear(confidence, 2),
    p_agreement_score: redondear(agreement, 2),
    p_computed_at: new Date().toISOString(),
    p_updated_at: new Date().toISOString(),
    p_monte_carlo: monteCarlo,
  } as never)

  if (upsertError) {
    logger.error("[cron-precompute] upsert error", { turno, error: JSON.stringify(upsertError), numeros3Len: numeros_3.length, numeros4Len: numeros_4.length })
    throw upsertError
  }
}

function getEmoji(n: number): string {
  return SUENOS[n]?.emoji || "❓"
}

function getSignificado(n: number): string {
  return SUENOS[n]?.nombre || "❓"
}
