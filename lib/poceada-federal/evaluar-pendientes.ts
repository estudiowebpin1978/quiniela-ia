/**
 * Evaluación post-hoc de predicciones Poceada Federal pendientes (frente F).
 *
 * Se verifica cada predicción con estado 'pendiente' SOLO contra resultados
 * oficiales ya validados en la base. Si el sorteo objetivo todavía no está
 * publicado → sigue pendiente (nunca se inventa). Caso permanente inválido →
 * 'no_evaluable' con motivo explícito.
 *
 * Se llama desde el cron nocturno (cron-poceada-federal, tras sincronizar) y
 * desde el GET de combinaciones, para que la autoevaluación corra sola sin
 * depender de que un usuario abra la página.
 */
import { evaluarPrediccion } from "./evaluacion"
import * as repo from "./repositorio"

export interface InformeEvaluacion {
  evaluadas: number
  noEvaluables: number
  restantes: number
}

export async function evaluarPendientes(): Promise<InformeEvaluacion> {
  const pendientes = await repo.listarPrediccionesPorEstado("pendiente")
  if (pendientes.length === 0) {
    return { evaluadas: 0, noEvaluables: 0, restantes: 0 }
  }

  let evaluadas = 0
  let noEvaluables = 0
  let restantes = 0
  const sorteos = await repo.historialValidado()

  for (const p of pendientes) {
    const { evaluacion, motivo } = evaluarPrediccion(p, sorteos)
    if (evaluacion) {
      const drawId = await repo.idDrawPorConcurso(evaluacion.concursoEvaluado)
      await repo.marcarEvaluacion(p.id, drawId, evaluacion as unknown as Record<string, unknown>)
      evaluadas++
      // Replica el estado también en el objeto local: el GET devuelve estas
      // copias y la UI debe ver la predicción ya evaluada en esta misma tanda.
      p.estado = "evaluada"
      p.evaluacion = evaluacion as unknown as Record<string, unknown>
      p.evaluacion_draw_id = drawId
    } else if (motivo && (motivo.includes("no es posterior") || motivo.includes("inválido"))) {
      // Caso permanente: jamás será evaluable → estado con motivo explícito.
      await repo.marcarNoEvaluable(p.id, motivo)
      noEvaluables++
      p.estado = "no_evaluable"
      p.evaluacion = { motivo }
    } else {
      // "todavía no publicado" / "sin resultados posteriores" → pendiente.
      restantes++
    }
  }

  return { evaluadas, noEvaluables, restantes }
}
