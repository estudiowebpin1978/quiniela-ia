import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { sincronizar } from "@/lib/poceada-federal/actualizar"
import { importarHistorico } from "@/lib/poceada-federal/backfill"
import { listarSorteosIAFAS, extraerExtractoPdfIAFAS } from "@/lib/poceada-federal/fuente"
import * as repo from "@/lib/poceada-federal/repositorio"
import { ErrorMigracionPendiente, type FilaInsertable } from "@/lib/poceada-federal/repositorio"
import { evaluarPendientes, type InformeEvaluacion } from "@/lib/poceada-federal/evaluar-pendientes"
import type { RepoSincronizacion } from "@/lib/poceada-federal/actualizar"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * GET /api/cron-poceada-federal
 *
 * Sincroniza los últimos sorteos oficiales de Poceada Federal (IAFAS
 * /ultimoExtracto + extracto HTML de Lotería de Santa Fe, con corroboración
 * cruzada) y, opcionalmente, ejecuta UN lote reanudable del backfill
 * histórico (?historico=desde,hasta&limite=N, PDFs oficiales IAFAS).
 *
 * Protegido con el mecanismo de cron del proyecto (CRON_SECRET timing-safe o
 * token admin). Idempotente: sólo inserta concursos inexistentes. La tarea de
 * cron-job.org recomendada está documentada en docs/poceada-federal.md.
 * NO modifica los crons existentes de Quiniela/Brinco.
 */

const repoSinc: RepoSincronizacion = {
  insertar: (filas) => repo.insertarSorteos(filas as FilaInsertable[]),
  mapa: async () => (await repo.mapaExistentes()) as never,
  corroborar: (concurso, d) => repo.agregarCorroboracion(concurso, d),
  incidente: (c, t, d) => repo.registrarIncidente(c, t, d),
  refrescarConsultas: (concursos, iso) => repo.refrescarConsultas(concursos, iso),
  ultimoValidado: async () => {
    const u = await repo.ultimoValidado()
    return u ? { concurso: u.concurso, fecha: u.fecha } : null
  },
}

export async function GET(req: NextRequest) {
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const t0 = Date.now()
  try {
    const informe = await sincronizar({ repo: repoSinc })

    let backfill = null
    const hist = req.nextUrl.searchParams.get("historico")
    if (hist) {
      const [desde, hasta] = hist.split(",")
      const limite = Number(req.nextUrl.searchParams.get("limite") ?? "40")
      backfill = await importarHistorico(
        {
          listar: (d, h) => listarSorteosIAFAS(d, h),
          pdf: (c, f, pref) => extraerExtractoPdfIAFAS(c, f, {}, pref),
          repo: {
            concursos: (d, h) => repo.concursosExistentes(d, h),
            insertar: (filas) => repo.insertarSorteos(filas as FilaInsertable[]),
            incidente: (c, t, d) => repo.registrarIncidente(c, t, d),
          },
        },
        { desde, hasta: hasta ?? desde, limite, modo: "importar" }
      )
    }

    logger.info("[cron-poceada-federal] sincronización", {
      ok: informe.ok,
      importados: informe.importados,
      conflictos: informe.conflictos,
      duracionMs: Date.now() - t0,
    })

    // Frente F: autoevaluación post-sorteo. Tras sincronizar (nuevo resultado
    // oficial validado) se cierran las predicciones pendientes contra el
    // concurso ya publicado — sin inventar datos si sigue sin publicarse.
    let evaluacion: InformeEvaluacion | null = null
    try {
      evaluacion = await evaluarPendientes()
    } catch (ev) {
      logger.error("[cron-poceada-federal] evaluación pendientes", { error: String(ev) })
    }

    // Observabilidad: registrar la corrida en cron_logs para /api/health
    // (CRON_FRESHNESS) y el dashboard de monitoreo (antes esta ruta era
    // invisible: solo logger.info, sin fila en cron_logs).
    logCronExecution("cron-poceada-federal", {
      ok: informe.ok,
      importados: informe.importados,
      conflictos: informe.conflictos,
      evaluados: evaluacion ? (evaluacion.evaluadas ?? 0) : null,
      duracionMs: Date.now() - t0,
    }, t0)

    return NextResponse.json({
      ok: informe.ok,
      informe,
      evaluacion,
      backfill,
      duracionMs: Date.now() - t0,
    })
  } catch (e) {
    if (e instanceof ErrorMigracionPendiente) {
      return NextResponse.json(
        { ok: false, error: "migracion_pendiente", detalle: e.message },
        { status: 503 }
      )
    }
    logger.error("[cron-poceada-federal] error", { error: String(e) })
    return NextResponse.json(
      { ok: false, error: "error_interno", detalle: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
