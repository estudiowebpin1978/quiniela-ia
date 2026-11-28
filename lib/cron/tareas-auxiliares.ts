/**
 * Tareas auxiliares acopladas al tick vivo de cron-verify (cada ~5 min),
 * con gate de frecuencia propio por tarea.
 *
 * Motivo de existir (auditoría 2026-10-12, prod):
 *  - El Cron de Vercel (/api/cron-premium-expiry, "0 4 * * *") está registrado
 *    pero NO recibe invocaciones (0 corridas automáticas en cron_logs).
 *  - /api/cron-scrape (externo) puede pausarse sin aviso.
 *  - En cambio cron-verify-predictions corre cada ~5 min de forma continua.
 *
 * Por eso los vencimientos Premium se ejecutan aquí con su propia cadencia:
 *  - gate por cron_logs: no corre si su última corrida es reciente;
 *  - try/catch por tarea: un fallo no afecta a la otra ni a la verificación;
 *  - logCronExecution con su propio nombre, así /api/health
 *    (CRON_FRESHNESS) y el dashboard de cron_logs los ven con su identidad.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import { logCronExecution } from "@/lib/cron/auth"
import { procesarVencimientosPremium } from "@/lib/premium/vencimientos"
import logger from "@/lib/logger"

const INTERVALOS_MS = {
  /** Downgrade de Premium vencido + avisos (cadencia diaria). */
  "cron-premium-expiry": 20 * 60 * 60 * 1000,
} as const


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
