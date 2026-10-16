import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { sincronizar } from "@/lib/poceada-federal/actualizar"
import { backtestWalkForward } from "@/lib/poceada-federal/backtest"
import { generarCombinaciones } from "@/lib/poceada-federal/combinaciones"
import { evaluarPrediccion } from "@/lib/poceada-federal/evaluacion"
import * as repo from "@/lib/poceada-federal/repositorio"
import {
  ErrorMigracionPendiente,
  type FilaInsertable,
  type PrediccionGuardada,
} from "@/lib/poceada-federal/repositorio"
import type { RepoSincronizacion } from "@/lib/poceada-federal/actualizar"
import { listarSorteosIAFAS } from "@/lib/poceada-federal/fuente"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 300

/**
 * POST /api/poceada-federal/combinaciones — PREMIUM.
 * Nuevo análisis (sección 6): sincroniza (best-effort), recalcula el motor
 * sobre TODO el historial validado, genera las 5 combinaciones, corre el
 * backtesting walk-forward acotado y guarda la instantánea auditable ANTES
 * del sorteo objetivo. Si la sincronización falla, usa el último historial
 * validado y lo declara explícitamente (nunca afirma datos frescos).
 *
 * GET (PREMIUM): lista las instantáneas guardadas (append-only).
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

async function requerirPremium(req: NextRequest): Promise<NextResponse | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ ok: false, error: "no_auth" }, { status: 401 })
  const tier = await resolveUserTier(token)
  if (!tier.canAccessPremiumFeatures) {
    return NextResponse.json({ ok: false, error: "no_premium" }, { status: 403 })
  }
  return null
}

export async function GET(req: NextRequest) {
  const denegado = await requerirPremium(req)
  if (denegado) return denegado
  try {
    const predicciones = await repo.listarPredicciones(10)

    // Evaluación post-hoc perezosa: se verifica cada predicción pendiente
    // SOLO contra resultados oficiales ya validados en la base. Si el sorteo
    // objetivo todavía no está publicado → sigue pendiente (nunca se inventa).
    const pendientes = predicciones.filter((p) => p.estado === "pendiente")
    if (pendientes.length > 0) {
      const sorteos = await repo.historialValidado()
      for (const p of pendientes) {
        const { evaluacion, motivo } = evaluarPrediccion(p, sorteos)
        if (evaluacion) {
          const drawId = await repo.idDrawPorConcurso(evaluacion.concursoEvaluado)
          await repo.marcarEvaluacion(p.id, drawId, evaluacion as unknown as Record<string, unknown>)
          p.estado = "evaluada"
          p.evaluacion = evaluacion as unknown as Record<string, unknown>
          p.evaluacion_draw_id = drawId
        } else if (motivo && (motivo.includes("no es posterior") || motivo.includes("inválido"))) {
          // Caso permanente: jamás será evaluable → estado con motivo explícito.
          await repo.marcarNoEvaluable(p.id, motivo)
          p.estado = "no_evaluable"
          p.evaluacion = { motivo }
        }
        // "todavía no publicado" / "sin resultados posteriores" → pendiente.
      }
    }

    return NextResponse.json({ ok: true, predicciones: predicciones as PrediccionGuardada[] })
  } catch (e) {
    if (e instanceof ErrorMigracionPendiente) {
      return NextResponse.json({ ok: false, error: "migracion_pendiente" }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: "error_interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const denegado = await requerirPremium(req)
  if (denegado) return denegado
  const t0 = Date.now()
  try {
    // 1. Best-effort: verificar/incorporar resultados oficiales nuevos.
    let sincronizacion: Record<string, unknown>
    try {
      const inf = await sincronizar({ repo: repoSinc })
      sincronizacion = {
        ok: inf.ok,
        fuenteUsada: inf.fuenteUsada,
        importados: inf.importados,
        corroborados: inf.corroborados,
        detalle: inf.detalle,
        intentoEn: inf.intentoEn,
        datosNuevos: inf.importados > 0 || inf.corroborados > 0,
      }
    } catch (e) {
      sincronizacion = {
        ok: false,
        datosNuevos: false,
        detalle: `Sincronización fallida, se usa el historial validado existente: ${
          e instanceof Error ? e.message : String(e)
        }`,
      }
    }

    // 2. TODO el historial validado (nunca una muestra parcial sin avisar).
    const historial = await repo.historialValidado()
    if (historial.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "sin_historial_validado",
          detalle:
            "No hay sorteos validados todavía. Ejecutá el cron /api/cron-poceada-federal con backfill histórico y volvé a intentar.",
          sincronizacion,
        },
        { status: 503 }
      )
    }

    // 3. Generación sobre todo el historial + 4. backtesting acotado.
    const ultimaFecha = historial[historial.length - 1].fecha
    const horasDesdeUltimo =
      (Date.now() - new Date(`${ultimaFecha}T12:00:00Z`).getTime()) / 36e5
    const generacion = generarCombinaciones(historial)
    const backtest = backtestWalkForward(historial, { maxEvaluaciones: 40 })

    // 5. Sorteo objetivo: sólo se afirma si está confirmado en la fuente oficial.
    let objetivo: { confirmado: boolean; concurso?: number; fecha?: string; nota?: string } = {
      confirmado: false,
    }
    try {
      const filas = await listarSorteosIAFAS(ultimaFecha, new Date().toISOString().slice(0, 10))
      const posteriores = filas.filter(
        (f) => f.Fecha2 > ultimaFecha && String(f.Estado).toUpperCase() === "CONFIRMADO"
      )
      if (posteriores.length > 0) {
        objetivo = { confirmado: true, concurso: posteriores[0].NROSorteo, fecha: posteriores[0].Fecha2 }
      } else {
        objetivo = { confirmado: false, nota: "Próximo sorteo no confirmado en la fuente oficial (fecha provisional)" }
      }
    } catch {
      objetivo = { confirmado: false, nota: "Fuente oficial no consultable ahora (fecha provisional)" }
    }

    // 6. Instantánea auditable (append-only) ANTES del sorteo objetivo.
    //    Si la fuente oficial confirmó el próximo sorteo, se registra el
    //    concurso objetivo para poder verificarla después con el resultado
    //    oficial (sin confirmar → queda explícito, nunca se inventa).
    const ultimo = historial[historial.length - 1]
    let prediccionId: string | null = null
    try {
      prediccionId = await repo.guardarPrediccion({
        sorteo_objetivo_concurso: objetivo.confirmado && objetivo.concurso != null ? objetivo.concurso : null,
        sorteo_objetivo_confirmado: Boolean(objetivo.confirmado && objetivo.concurso != null),
        generado_en: new Date().toISOString(),
        historial_corte_fecha: ultimaFecha,
        historial_corte_concurso: ultimo.concurso,
        entrenamiento_count: historial.length,
        historial_huella: generacion.historial.huella,
        algoritmo_version: generacion.version,
        combinaciones: generacion.jugadas as unknown[],
      })
    } catch (e) {
      if (!(e instanceof ErrorMigracionPendiente)) throw e
    }

    logger.info("[poceada-federal] análisis", {
      historial: historial.length,
      prediccionId,
      ventajaDemostrada: backtest.diferencia.ventajaDemostrada,
      duracionMs: Date.now() - t0,
    })

    return NextResponse.json({
      ok: true,
      sincronizacion,
      historial: {
        ...generacion.historial,
        antiguedadUltimoDias: Math.round(horasDesdeUltimo / 24),
      },
      jugadas: generacion.jugadas,
      etiqueta: generacion.etiqueta,
      ventajaDemostrada: generacion.ventajaDemostrada,
      probabilidadesTeoricas: generacion.probabilidadesTeoricas,
      advertencias: generacion.advertencias,
      meta: generacion.meta,
      backtest,
      objetivo,
      prediccionId,
      version: generacion.version,
      generadoEn: generacion.generadoEn,
      duracionMs: Date.now() - t0,
    })
  } catch (e) {
    if (e instanceof ErrorMigracionPendiente) {
      return NextResponse.json({ ok: false, error: "migracion_pendiente" }, { status: 503 })
    }
    logger.error("[poceada-federal] análisis error", { error: String(e) })
    return NextResponse.json({ ok: false, error: "error_interno" }, { status: 500 })
  }
}
