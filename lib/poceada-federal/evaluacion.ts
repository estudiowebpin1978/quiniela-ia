/**
 * Evaluación POST-HOC de predicciones registradas (sección 5).
 *
 * Reglas:
 *  · una predicción sólo puede evaluarse con un resultado PUBLICADO DESPUÉS
 *    de haber sido registrada (comparado por fecha de sorteo y, si existe,
 *    por el concurso objetivo confirmado)
 *  · si el sorteo objetivo no está confirmado → estado "no_evaluable" con
 *    motivo explícito (nunca se inventa el sorteo evaluado)
 *  · se conserva el registro original: sólo se agrega la evaluación
 */

import type { SorteoValidado } from "./estadisticas"
import type { PrediccionGuardada } from "./repositorio"

export interface EvaluacionPrediccion {
  concursoEvaluado: number
  fechaEvaluada: string
  aciertosPorJugada: number[]
  maximo: number
  promedio: number
  alMenos6: number // contejo de jugadas con ≥6 (0-5)
  alMenos7: number
  alMenos8: number
  generadoEn: string
  sorteoPosteriorAlRegistro: boolean
}

function aciertos(a: number[], b: number[]): number {
  const s = new Set(b)
  return a.reduce((n, x) => n + (s.has(x) ? 1 : 0), 0)
}

/**
 * Evalúa una predicción guardada contra el historial de sorteos validados.
 * Devuelve null si todavía no hay sorteo evaluable (motivo en `motivo`).
 */
export function evaluarPrediccion(
  pred: PrediccionGuardada,
  sorteos: SorteoValidado[]
): { evaluacion: EvaluacionPrediccion | null; motivo?: string } {
  const generado = new Date(pred.generado_en).getTime()
  if (Number.isNaN(generado)) {
    return { evaluacion: null, motivo: "generado_en inválido" }
  }

  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.concurso - b.concurso
  )

  let objetivo: SorteoValidado | undefined
  if (pred.sorteo_objetivo_confirmado && pred.sorteo_objetivo_concurso) {
    objetivo = ordenados.find((s) => s.concurso === pred.sorteo_objetivo_concurso)
    if (!objetivo) {
      return {
        evaluacion: null,
        motivo: `El sorteo objetivo ${pred.sorteo_objetivo_concurso} todavía no está publicado como validado`,
      }
    }
  } else {
    // Sin objetivo confirmado: se toma el primer sorteo validado cuya fecha es
    // posterior a la generación. Si no hay ninguno → no evaluable.
    objetivo = ordenados.find((s) => new Date(`${s.fecha}T23:59:59Z`).getTime() > generado)
    if (!objetivo) {
      return {
        evaluacion: null,
        motivo: "Sin sorteo objetivo confirmado y sin resultados publicados posteriores al registro",
      }
    }
  }

  // Comparación por día (formato ISO): el sorteo no puede ser de un día
  // ANTERIOR al registro; el mismo día sí (se genera antes del sorteo real,
  // p. ej. registro 12:00 vs sorteo 15:00).
  const diaGenerado = pred.generado_en.slice(0, 10)
  const posterior = objetivo.fecha >= diaGenerado
  if (!posterior) {
    return {
      evaluacion: null,
      motivo: `El sorteo del ${objetivo.fecha} no es posterior al registro (${pred.generado_en}): no se permite evaluar con datos previos`,
    }
  }

  const combos = (pred.combinaciones ?? []) as { numeros?: number[] }[]
  const aciertosPorJugada = combos.map((c) => aciertos(c.numeros ?? [], objetivo.numeros))
  const total = aciertosPorJugada.reduce((a, b) => a + b, 0)

  return {
    evaluacion: {
      concursoEvaluado: objetivo.concurso,
      fechaEvaluada: objetivo.fecha,
      aciertosPorJugada,
      maximo: Math.max(...aciertosPorJugada, 0),
      promedio: Number((total / Math.max(1, aciertosPorJugada.length)).toFixed(3)),
      alMenos6: aciertosPorJugada.filter((h) => h >= 6).length,
      alMenos7: aciertosPorJugada.filter((h) => h >= 7).length,
      alMenos8: aciertosPorJugada.filter((h) => h >= 8).length,
      generadoEn: pred.generado_en,
      sorteoPosteriorAlRegistro: true,
    },
  }
}
