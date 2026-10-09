/**
 * Actualización incremental del historial del Brinco (bajo demanda y cron).
 *
 * No re-descarga el historial completo: consulta qué fechas (domingos) ya están
 * importadas y solo scrapea las faltantes o las de un par de semanas recientes
 * por si hubo correcciones. Usa concurrencia limitada, pausa y timeouts. Si la
 * fuente falla, conserva los datos existentes y registra el error (nunca
 * reemplaza el historial con vacío).
 */

import {
  backfillFechas,
  type InformeImportacion,
} from "@/lib/brinco/importar"
import { ultimosDomingos } from "@/lib/brinco/importar"
import { brincoStoreSupabase, cargarSorteosBrinco, ultimaFechaBrinco } from "@/lib/brinco/store"
import logger from "@/lib/logger"

export interface EstadoSincronizacion {
  sorteosTotales: number
  datosHasta: string | null
  actualizadoAhora: boolean
  importadosNuevos: number
  conflictos: number
  errores: number
  sinResultado: number
  fuenteDisponible: boolean
}

export interface ResultadoActualizacion {
  informe: InformeImportacion
  estado: EstadoSincronizacion
}

/**
 * Intenta incorporar los últimos `domingos` sorteos faltantes.
 * `apply: false` → dry-run (solo clasifica, no escribe).
 */
export async function actualizarIncrementalBrinco(
  opciones: { domingos?: number; apply?: boolean } = {},
): Promise<ResultadoActualizacion> {
  const { domingos = 4, apply = true } = opciones
  const store = brincoStoreSupabase()
  const fechas = ultimosDomingos(domingos)

  let informe: InformeImportacion
  try {
    informe = await backfillFechas(fechas, store, {
      apply,
      concurrency: 2,
      pausaMs: 300,
      omitirExistentes: true,
    })
  } catch (e) {
    logger.warn("[brinco-actualizar] backfill failed", { error: String(e) })
    informe = {
      total_fechas: fechas.length,
      importados: 0,
      omitidos_duplicados: 0,
      conflictos: 0,
      rechazados: 0,
      sin_resultado: 0,
      errores: 1,
      detalles: [{ fecha: "", status: "error", motivo: String(e) }],
    }
  }

  const sorteos = await cargarSorteosBrinco()
  const datosHasta = await ultimaFechaBrinco()

  return {
    informe,
    estado: {
      sorteosTotales: sorteos.length,
      datosHasta,
      actualizadoAhora: apply && informe.importados > 0,
      importadosNuevos: informe.importados,
      conflictos: informe.conflictos,
      errores: informe.errores,
      sinResultado: informe.sin_resultado,
      // La fuente está "disponible" si no hubo errores de red/scrape en esta corrida.
      fuenteDisponible: informe.errores === 0,
    },
  }
}
