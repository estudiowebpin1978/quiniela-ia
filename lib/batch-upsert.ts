/**
 * Batch Upsert — Chunked inserts for Supabase.
 *
 * Instead of N individual inserts, we build an array in memory
 * and upsert in chunks of CHUNK_SIZE. This reduces network round-trips
 * from N to ceil(N/500).
 *
 * If any chunk fails, we log the error and continue with the next chunk.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"

const CHUNK_SIZE = 500

/**
 * Normaliza la redoblona al formato ARRAY ÚNICO seguro para la RPC
 * `verify_predictions_for_draw` (paso redoblona: `jsonb_array_elements_text`
 * sobre `numeros[1]->'r'`).
 *
 * Cualquier cosa que no sea array revienta esa función con
 * "cannot extract elements from a scalar" (verificado empíricamente: aplica
 * a strings, objetos Y jsonb `null`) y rompe la verificación de TODO el
 * (date, turno), no solo de esa fila. Por eso este helper devuelve SIEMPRE
 * un array — vacío `[]` cuando no hay redoblona (`[]` es inofensivo:
 * 0 filas), nunca `null`.
 *
 * - string "07-12"      → ["07-12"]
 * - objeto {cabeza, acompañante} (POST /api/predictions) → ["07-12"]
 * - array ya formado (UI) → se respeta
 * - nada / vacío        → []
 *
 * Historicamente (2026-10-13) se guardaban strings y null: 84 filas en
 * producción con "r" string (reparación pendiente de confirmación) y las
 * filas con "r": null también rompían la RPC.
 */
export function normalizarRedoblonaR(r: unknown): string[] {
  if (r == null) return []
  if (Array.isArray(r)) {
    return r.filter((x) => x != null).map(String)
  }
  if (typeof r === "string") {
    const s = r.trim()
    return s ? [s] : []
  }
  if (typeof r === "object") {
    const o = r as { cabeza?: unknown; acompanante?: unknown }
    if (o.cabeza != null && o.acompanante != null) {
      return [
        `${String(o.cabeza).padStart(2, "0")}-${String(o.acompanante).padStart(2, "0")}`,
      ]
    }
  }
  return []
}

/**
 * Upsert a large array of rows in chunks.
 * Returns { total, succeeded, failed }.
 */
export async function batchUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  options: {
    onConflict: string
    ignoreDuplicates?: boolean
  },
): Promise<{ total: number; succeeded: number; failed: number; errors: string[] }> {
  const supabase = getSupabaseAdmin()
  let succeeded = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1

    const { error } = await supabase
      .from(table)
      .upsert(chunk, {
        onConflict: options.onConflict,
        ignoreDuplicates: options.ignoreDuplicates ?? false,
      })

    if (error) {
      logger.error(`[batch-upsert] Chunk ${chunkIndex} failed`, {
        table,
        chunkSize: chunk.length,
        error: error.message,
      })
      errors.push(`Chunk ${chunkIndex}: ${error.message}`)
      failed += chunk.length
    } else {
      succeeded += chunk.length
    }
  }

  return { total: rows.length, succeeded, failed, errors }
}

/**
 * Build prediction payload for a batch of users.
 * The prediction is computed ONCE and shared across all users.
 */
export function buildPredictionRows(
  users: Array<{ user_id: string; role: string }>,
  prediction: {
    numeros_2: string[]
    numeros_3?: string[]
    numeros_4?: string[]
    /** "07-12" (string), {cabeza, acompañante} o array — se normaliza a array */
    redoblona?: string | { cabeza: string; acompanante: string } | string[] | null
  },
  metadata: {
    game_id: string
    date: string
    turno: string
    engine_version: string
    confidence: number | null
  },
): Array<{
  user_id: string
  game_id: string
  date: string
  turno: string
  numeros: string[]
  engine_version: string
  confidence: number | null
}> {
  const rows: Array<{
    user_id: string
    game_id: string
    date: string
    turno: string
    numeros: string[]
    engine_version: string
    confidence: number | null
  }> = []

  for (const user of users) {
    const isPremium = user.role === "premium" || user.role === "admin"
    const numeros2 = prediction.numeros_2.slice(0, 10)

    let numerosToStore: string[]
    if (isPremium && prediction.numeros_3 && prediction.numeros_3.length > 0) {
      numerosToStore = [JSON.stringify({
        "2": numeros2,
        "3": prediction.numeros_3,
        "4": prediction.numeros_4 || [],
        // SIEMPRE array (nunca scalar/objeto/null): otro formato rompe la RPC
        "r": normalizarRedoblonaR(prediction.redoblona),
      })]
    } else {
      numerosToStore = numeros2
    }

    rows.push({
      user_id: user.user_id,
      game_id: metadata.game_id,
      date: metadata.date,
      turno: metadata.turno,
      numeros: numerosToStore,
      engine_version: metadata.engine_version,
      confidence: metadata.confidence,
    })
  }

  return rows
}
