/**
 * Tareas auxiliares acopladas al tick vivo de cron-verify (cada ~5 min),
 * con gate de frecuencia propio por tarea.
 *
 * Motivo de existir (auditoría 2026-10-12, prod):
 *  - El Cron de Vercel (/api/cron-premium-expiry, "0 4 * * *") está registrado
 *    pero NO recibe invocaciones (0 corridas automáticas en cron_logs).
 *  - /api/cron-brinco depende de un cron externo que todavía no existe.
 *  - /api/cron-scrape (externo) puede pausarse sin aviso.
 *  - En cambio cron-verify-predictions corre cada ~5 min de forma continua.
 *
 * Por eso Brinco (sync + verificación) y los vencimientos Premium se ejecutan
 * aquí con su propia cadencia:
 *  - gate por cron_logs: no corre si su última corrida es reciente;
 *  - try/catch por tarea: un fallo no afecta a la otra ni a la verificación;
 *  - logCronExecution con su propio nombre, así /api/health
 *    (CRON_FRESHNESS) y el dashboard de cron_logs los ven con su identidad.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import { logCronExecution } from "@/lib/cron/auth"
import { actualizarIncrementalBrinco } from "@/lib/brinco/actualizar"
import { verificarPendientesBrinco } from "@/lib/brinco/verificar"
import { procesarVencimientosPremium } from "@/lib/premium/vencimientos"
import { ejecutarLotePrecompute } from "@/lib/pipeline/precompute/lote-diario"
import { autoTrainAll } from "@/lib/ml/auto-train"
import logger from "@/lib/logger"

const INTERVALOS_MS = {
  /** Sync incremental desde CAS + verificación de predicciones. */
  "cron-brinco": 2 * 60 * 60 * 1000,
  /** Downgrade de Premium vencido + avisos (cadencia diaria). */
  "cron-premium-expiry": 20 * 60 * 60 * 1000,
} as const

/** Separación mínima entre corridas del lote precompute (respaldo diario). */
const PRECOMPUTE_INTERVALO_MS = 23 * 60 * 60 * 1000

/** Re-entrenamiento ML (Markov + RF + NN por turno): respaldo semanal. */
const ML_INTERVALO_MS = 7 * 24 * 60 * 60 * 1000

/** ¿Pasó el intervalo mínimo desde la última corrida registrada del tarea? */
async function debeEjecutar(nombre: string, intervaloMs: number): Promise<boolean> {
  try {
    const sb = getSupabaseAdmin()
    const { data, error } = await sb
      .from("cron_logs")
      .select("created_at")
      .eq("cron_name", nombre)
      .order("created_at", { ascending: false })
      .limit(1)
    if (error) return true // sin historial consultable → ejecutar
    const last = (data as Array<{ created_at: string }> | null)?.[0]?.created_at
    if (!last) return true
    return Date.now() - new Date(last).getTime() >= intervaloMs
  } catch {
    return true
  }
}

export interface InformeTareasAuxiliares {
  ejecutadas: string[]
  omitidas: string[]
  errores: string[]
}

/**
 * Ejecuta las tareas cuyo gate lo permite. Best-effort: nunca lanza.
 * Devuelve qué corrió, qué se omitió (gate) y qué falló.
 */
export async function ejecutarTareasAuxiliares(): Promise<InformeTareasAuxiliares> {
  const informe: InformeTareasAuxiliares = { ejecutadas: [], omitidas: [], errores: [] }

  // ── Brinco: sync incremental + verificación de predicciones ──────────
  try {
    if (await debeEjecutar("cron-brinco", INTERVALOS_MS["cron-brinco"])) {
      const t0 = Date.now()
      const { informe: informeImport, estado } = await actualizarIncrementalBrinco({ domingos: 3, apply: true })
      const v = await verificarPendientesBrinco()
      logCronExecution("cron-brinco", {
        origen: "tareas-auxiliares",
        importados: informeImport.importados,
        errores: informeImport.errores,
        sinResultado: informeImport.sin_resultado,
        datosHasta: estado.datosHasta,
        prediccionesVerificadas: v.verificadas,
        pendientesRevisadas: v.pendientes,
        pendientesSinResultado: v.sinResultado,
      }, t0)
      informe.ejecutadas.push("cron-brinco")
    } else {
      informe.omitidas.push("cron-brinco")
    }
  } catch (e) {
    informe.errores.push("cron-brinco")
    logger.warn("[tareas-auxiliares] cron-brinco falló (no bloquea)", { error: String(e) })
  }

  // ── Vencimientos Premium (downgrade + avisos) ────────────────────────
  try {
    if (await debeEjecutar("cron-premium-expiry", INTERVALOS_MS["cron-premium-expiry"])) {
      const t0 = Date.now()
      const r = await procesarVencimientosPremium()
      logCronExecution("cron-premium-expiry", { origen: "tareas-auxiliares", ...r }, t0)
      informe.ejecutadas.push("cron-premium-expiry")
    } else {
      informe.omitidas.push("cron-premium-expiry")
    }
  } catch (e) {
    informe.errores.push("cron-premium-expiry")
    logger.warn("[tareas-auxiliares] cron-premium-expiry falló (no bloquea)", { error: String(e) })
  }

  // ── Precompute del ensemble (respaldo diario) ─────────────────────────
  // El disparo externo (cron-job.org) puede pausarse sin aviso, como ya pasó
  // con cron-premium-expiry y cron-brinco (auditoría 2026-10-12). Con este gate
  // el lote diario no depende de ese trigger: si no corrió en ~24 h, corre aquí.
  // Idempotente: reescribe la fila de cache del día con la misma semilla.
  let precomputeCorrio = false
  try {
    if (await debeEjecutar("cron-precompute", PRECOMPUTE_INTERVALO_MS)) {
      const r = await ejecutarLotePrecompute(null, "tareas-auxiliares")
      informe.ejecutadas.push("cron-precompute")
      precomputeCorrio = true
      if (!r.results.every((x) => x.ok)) {
        logger.warn("[tareas-auxiliares] precompute con turnos con error", { resultados: r.results })
      }
    } else {
      informe.omitidas.push("cron-precompute")
    }
  } catch (e) {
    informe.errores.push("cron-precompute")
    logger.warn("[tareas-auxiliares] cron-precompute falló (no bloquea)", { error: String(e) })
  }

  // ── Re-entrenamiento ML (respaldo semanal) ────────────────────────────
  // El POST /api/cron-ml-training depende de un trigger externo que puede
  // no llegar (mismo modo de falla que cron-precompute). Con este gate los
  // modelos ML se re-entrenan al menos semanalmente. Presupuesto dinámico:
  // si el precompute corrió en este mismo tick, el time budget se reduce.
  try {
    if (await debeEjecutar("cron-ml-training", ML_INTERVALO_MS)) {
      const t0 = Date.now()
      const presupuestoMs = precomputeCorrio ? 40_000 : 85_000
      const results = await autoTrainAll(false, t0 + presupuestoMs)
      const total = results.reduce((s, r) => s + r.modelos.length, 0)
      logCronExecution("cron-ml-training", {
        origen: "tareas-auxiliares",
        total,
        turnos: results.map((r) => r.turno).join(","),
        tiempoMs: Date.now() - t0,
      }, t0)
      informe.ejecutadas.push("cron-ml-training")
    } else {
      informe.omitidas.push("cron-ml-training")
    }
  } catch (e) {
    informe.errores.push("cron-ml-training")
    logger.warn("[tareas-auxiliares] cron-ml-training falló (no bloquea)", { error: String(e) })
  }

  // ── Sweep de verificaciones atrasadas (respaldo ~48 h) ────────────────
  // cron-verify-catchup (RPC sweep_expired_predictions) marca PENDING viejas
  // como LOST cuando no existió sorteo y re-verifico casos donde el trigger
  // SQL no disparó. Registrado en el dashboard de salud pero sin trigger
  // efectivo: corre contra la BD, es barato y el gate ya lo limita.
  try {
    if (await debeEjecutar("cron-verify-catchup", 36 * 60 * 60 * 1000)) {
      const t0 = Date.now()
      const { data, error } = await getSupabaseAdmin().rpc("sweep_expired_predictions" as never)
      logCronExecution("cron-verify-catchup", { origen: "tareas-auxiliares", swept: (data as number) || 0, error: error?.message }, t0)
      if (error) {
        logger.warn("[tareas-auxiliares] sweep_expired_predictions falló", { error: error.message })
      }
      informe.ejecutadas.push("cron-verify-catchup")
    } else {
      informe.omitidas.push("cron-verify-catchup")
    }
  } catch (e) {
    informe.errores.push("cron-verify-catchup")
    logger.warn("[tareas-auxiliares] cron-verify-catchup falló (no bloquea)", { error: String(e) })
  }

  return informe
}
