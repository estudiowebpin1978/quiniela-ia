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
    redoblona?: string | null
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
        "r": prediction.redoblona || null,
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
