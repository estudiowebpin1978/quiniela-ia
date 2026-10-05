/**
 * Regla OMEGA + auditoría de promoción del precompute.
 *
 * Extraído de app/api/cron-precompute/route.ts. El bloque completo es
 * no bloqueante: cualquier error se loguea y el turno sigue (igual que antes).
 *
 * IDEMPOTENCIA: la versión original insertaba una fila idéntica en
 * omega_promotion_audit en CADA corrida (+6 filas por run, 6 turnos × N runs
 * al día). Ahora, antes de insertar, se consulta si ya existe una fila con la
 * MISMA clave lógica y, si existe, se salta el insert (logger.debug).
 * No se borran filas existentes ni se tocan tablas.
 */

import type { SupabaseClient } from "@supabase/supabase-js"
import { redondear } from "@/lib/pipeline/precompute/blend"
import type { EngineWeights } from "@/lib/pipeline/precompute/blend"
import logger from "@/lib/logger"

/** Versión anterior (OMEGA v1) y versión candidata a promoción. */
const OLD_VERSION = "omega-v1"
const NEW_VERSION = "meta-ensemble-v1"

export interface ParamsAuditoriaOmega {
  turno: string
  /** Fecha local (America/Argentina/Buenos_Aires, formato en-CA) */
  today: string
  /** Cantidad de turnos ok acumulados en la corrida actual */
  sampleSize: number
  engineWeights: EngineWeights
}

/**
 * Clave lógica de una fila de auditoría: mismo turno + mismas versiones +
 * mismo periodo de evaluación + misma decisión = MISMA auditoría (aunque
 * cambien sample_size, motivo o pesos entre corridas del mismo día).
 */
function claveAuditoriaOmega(turno: string, periodo: string, decision: string) {
  return { turno, periodo, decision }
}

/**
 * ¿Ya existe una fila con esta clave lógica? Falla abierto: ante cualquier
 * error de consulta devuelve false → se intenta el insert original.
 */
async function yaRegistrada(
  supabase: SupabaseClient,
  clave: { turno: string; periodo: string; decision: string },
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("omega_promotion_audit")
      .select("id")
      .eq("turno", clave.turno)
      .eq("old_engine_version", OLD_VERSION)
      .eq("new_engine_version", NEW_VERSION)
      .eq("evaluation_period_start", clave.periodo)
      .eq("evaluation_period_end", clave.periodo)
      .eq("promotion_decision", clave.decision)
      .limit(1)

    if (error) {
      logger.debug("[cron-precompute] Omega audit: consulta de duplicado falló (se inserta igual)", {
        turno: clave.turno,
        error: JSON.stringify(error),
      })
      return false
    }
    return !!data && data.length > 0
  } catch (e) {
    logger.debug("[cron-precompute] Omega audit: consulta de duplicado falló (se inserta igual)", {
      turno: clave.turno,
      error: String(e),
    })
    return false
  }
}

/**
 * Valida la regla Omega con el replay OOS actual y registra la auditoría de
 * promoción (idempotente por clave lógica turno+versiones+periodo+decisión).
 */
export async function auditarReglaOmega(
  supabase: SupabaseClient,
  params: ParamsAuditoriaOmega,
): Promise<void> {
  const { turno, today, sampleSize, engineWeights } = params

  try {
    const { data: omegaResult } = await supabase.rpc("omega_rule_validation" as never)
    const omegaPass = omegaResult ? (omegaResult as Record<string, unknown>).omega_pass !== false : true
    if (omegaResult && omegaPass === false) {
      logger.warn("[cron-precompute] Regla Omega: técnica no supera umbral OOS", { turno, omega: omegaResult })
    }

    const decision = omegaPass === false ? "REJECTED" : "APPROVED"
    const periodo = new Date(today).toISOString().split("T")[0]
    const clave = claveAuditoriaOmega(turno, periodo, decision)

    // Idempotencia: misma clave lógica ya auditada hoy → no duplicar la fila.
    if (await yaRegistrada(supabase, clave)) {
      logger.debug("[cron-precompute] Omega audit ya registrada (insert omitido)", clave)
      return
    }

    // Registrar auditoría de promoción con datos del replay actual
    const { error: auditErr } = await supabase.rpc("register_omega_promotion" as never, {
      p_turno: turno,
      p_old_version: OLD_VERSION,
      p_new_version: NEW_VERSION,
      p_decision: decision,
      p_reason: omegaPass === false ? "Regla Omega: técnica no supera umbral OOS (backtest)." : "Regla Omega: técnica supera umbral OOS.",
      p_sample_size: sampleSize,
      p_metrics_before: { engine: NEW_VERSION, note: "current" },
      p_metrics_after: { engine: NEW_VERSION, note: "replay_OOS", omega: omegaResult },
      p_weights_before: { v6: redondear(engineWeights.V6, 4), v7: redondear(engineWeights.V7, 4), ml: redondear(engineWeights.ML, 4) },
      p_weights_after: { v6: redondear(engineWeights.V6, 4), v7: redondear(engineWeights.V7, 4), ml: redondear(engineWeights.ML, 4) },
      p_calibration_before: { note: "before_replay" },
      p_calibration_after: { note: "after_replay", omega_result: omegaResult },
      p_period_start: periodo,
      p_period_end: periodo,
    } as never)
    if (auditErr) logger.warn("[cron-precompute] Omega audit registration failed", { turno, error: JSON.stringify(auditErr) })
  } catch (omegaErr: unknown) {
    logger.warn("[cron-precompute] Regla Omega: verificación fallida (no bloquea)", { turno, error: (omegaErr as Error).message })
  }
}
