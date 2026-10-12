/**
 * Verificación de predicciones de Brinco.
 *
 * Solo escribe cuando la fuente oficial ya publicó el resultado del concurso
 * objetivo: si el sorteo no existe aún (p. ej. la fuente marcó "sin sorteo"
 * para ese domingo), la predicción queda pendiente — nunca se inventa un
 * resultado.
 *
 * Se ejecuta desde:
 *  - /api/cron-brinco (cron programado),
 *  - /api/brinco/historial GET y /api/brinco/prediccion GET (bajo demanda:
 *    el usuario que abre /brinco la dispara sin esperar al cron),
 *  - lib/cron/tareas-auxiliares (tick vivo de cron-verify, gate cada 2 h).
 */

import {
  buscarSorteoPorConcurso,
  marcarVerificada,
  prediccionesPendientesVerificacion,
} from "@/lib/brinco/store"
import { contarAciertos } from "@/lib/brinco/reglas"
import logger from "@/lib/logger"

export interface ResultadoVerificacionBrinco {
  /** Predicciones que entraron a la corrida sin aciertos cargados. */
  pendientes: number
  /** Marcadas ahora contra un sorteo oficial ya importado. */
  verificadas: number
  /** Siguen pendientes porque el concurso objetivo aún no tiene resultado. */
  sinResultado: number
}

/**
 * Verifica las predicciones pendientes contra los sorteos ya importados.
 * Idempotente: una predicción verificada sale del conjunto pendiente y no se
 * toca de nuevo. Nunca bloquea por sorteo faltante.
 */
export async function verificarPendientesBrinco(): Promise<ResultadoVerificacionBrinco> {
  const pendientes = await prediccionesPendientesVerificacion()
  let verificadas = 0
  let sinResultado = 0

  for (const p of pendientes) {
    const sorteo = await buscarSorteoPorConcurso(p.concurso_objetivo)
    if (!sorteo) {
      // El concurso objetivo aún no se sorteó o la fuente no publicó el
      // resultado: la predicción queda pendiente (sin inventar datos).
      sinResultado++
      continue
    }
    const aTrad = contarAciertos(p.numeros, sorteo.tradicional)
    const aJr = sorteo.junior ? contarAciertos(p.numeros, sorteo.junior) : null
    await marcarVerificada(p.id as string, {
      aciertos_tradicional: aTrad,
      aciertos_junior: aJr,
      resultado_oficial: { tradicional: sorteo.tradicional, junior: sorteo.junior },
      estado: "verificada",
    })
    verificadas++
  }

  if (verificadas > 0) {
    logger.info("[brinco-verificar] predicciones verificadas", { verificadas, sinResultado })
  }
  return { pendientes: pendientes.length, verificadas, sinResultado }
}
