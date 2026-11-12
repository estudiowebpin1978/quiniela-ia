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
import { importarFaltantesDesdeExtractoOficial } from "@/lib/brinco/scraper-extracto"
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
  /** Sorteos incorporados desde el extracto oficial de Lotería de Santa Fe (fallback). */
  extractoImportados?: number
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

  // Fallback OFICIAL: la Lotería de Santa Fe publica el extracto aunque
  // cas.gob.ar no lo haga (acontecido con 1378 y 1379 en noviembre 2026).
  // Complementa al scrape de CAS — nunca sobrescribe filas existentes.
  let extractoImportados = 0
  let extractoErrores = 0
  try {
    const res = await importarFaltantesDesdeExtractoOficial(store)
    extractoImportados = res.importados
    extractoErrores = res.errores
    if (res.importados > 0 || res.errores > 0) {
      logger.info("[brinco-actualizar] extracto oficial", {
        intentos: res.intentos,
        importados: res.importados,
        errores: res.errores,
      })
    }
  } catch (e) {
    extractoErrores++
    logger.warn("[brinco-actualizar] extracto oficial falló", { error: String(e) })
  }

  const sorteos = await cargarSorteosBrinco()
  const datosHasta = await ultimaFechaBrinco()

  return {
    informe,
    estado: {
      sorteosTotales: sorteos.length,
      datosHasta,
      actualizadoAhora: apply && (informe.importados + extractoImportados) > 0,
      importadosNuevos: informe.importados + extractoImportados,
      conflictos: informe.conflictos,
      errores: informe.errores + extractoErrores,
      sinResultado: informe.sin_resultado,
      // La fuente está "disponible" si al menos una de las dos vías oficiales respondió sin error.
      fuenteDisponible: informe.errores === 0 || extractoErrores === 0,
      extractoImportados,
    },
  }
}
