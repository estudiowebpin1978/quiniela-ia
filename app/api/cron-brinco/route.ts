import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { actualizarIncrementalBrinco } from "@/lib/brinco/actualizar"
import {
  buscarSorteoPorConcurso,
  marcarVerificada,
  prediccionesPendientesVerificacion,
} from "@/lib/brinco/store"
import { contarAciertos } from "@/lib/brinco/reglas"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/**
 * GET /api/cron-brinco — sincroniza resultados del Brinco tras el sorteo semanal
 * (domingos 21:00 ART) y verifica las predicciones pendientes.
 *
 * Protegido con el mecanismo de cron del proyecto (CRON_SECRET timing-safe o
 * token admin). Ejecuta la MISMA importación incremental idempotente que la
 * actualización bajo demanda. No depende solo del cron: /api/brinco/prediccion
 * también detecta resultados faltantes.
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  try {
    // 1. Incorporar los últimos sorteos faltantes (idempotente).
    const { informe, estado } = await actualizarIncrementalBrinco({ domingos: 2, apply: true })

    // 2. Verificar predicciones cuyo concurso ya tiene resultado.
    const pendientes = await prediccionesPendientesVerificacion()
    let verificadas = 0
    for (const p of pendientes) {
      const sorteo = await buscarSorteoPorConcurso(p.concurso_objetivo)
      if (!sorteo) continue // el concurso objetivo aún no se sortea
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

    const result = {
      ok: estado.errores === 0,
      importados: informe.importados,
      omitidos: informe.omitidos_duplicados,
      conflictos: informe.conflictos,
      errores: informe.errores,
      sinResultado: informe.sin_resultado,
      sorteosTotales: estado.sorteosTotales,
      datosHasta: estado.datosHasta,
      prediccionesVerificadas: verificadas,
      pendientesRevisadas: pendientes.length,
    }
    logCronExecution("cron-brinco", result, t0)
    return NextResponse.json(result)
  } catch (e) {
    logger.error("[cron-brinco] error", { error: String(e) })
    const result = { ok: false, error: String(e) }
    logCronExecution("cron-brinco", result, t0)
    return NextResponse.json(result, { status: 500 })
  }
}
