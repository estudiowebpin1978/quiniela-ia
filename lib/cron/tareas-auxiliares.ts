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
import logger from "@/lib/logger"

const INTERVALOS_MS = {
  /** Sync incremental desde CAS + verificación de predicciones. */
  "cron-brinco": 2 * 60 * 60 * 1000,
  /** Downgrade de Premium vencido + avisos (cadencia diaria). */
  "cron-premium-expiry": 20 * 60 * 60 * 1000,
} as const

type Tarea = keyof typeof INTERVALOS_MS

/** ¿Pasó el intervalo mínimo desde la última corrida registrada del tarea? */
async function debeEjecutar(nombre: Tarea): Promise<boolean> {
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
    return Date.now() - new Date(last).getTime() >= INTERVALOS_MS[nombre]
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
    if (await debeEjecutar("cron-brinco")) {
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
    if (await debeEjecutar("cron-premium-expiry")) {
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

  return informe
}
