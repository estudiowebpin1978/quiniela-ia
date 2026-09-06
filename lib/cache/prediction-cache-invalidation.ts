/**
 * Invalidación centralizada de caches de predicción.
 * Llamar después de: nuevo draw guardado, cron-precompute completado.
 */

import logger from "@/lib/logger"

/** Limpia Redis (Upstash) para todas las keys qi:* de predicciones */
export async function invalidateRedisPredictionCache(): Promise<boolean> {
  try {
    const { redisClearPrefix } = await import("@/lib/redis")
    await redisClearPrefix("")
    return true
  } catch (e) {
    logger.warn("[cache] Redis invalidation failed", { error: String(e) })
    return false
  }
}

/** Señal para instancias warm de /api/predictions: bump version en Supabase app_cache si existe */
export async function bumpPredictionCacheGeneration(): Promise<void> {
  try {
    const { getSupabaseAdmin } = await import("@/lib/supabase-client")
    const supabase = getSupabaseAdmin()
    const gen = Date.now()
    await supabase.from("app_cache").upsert(
      { key: "predictions_cache_generation", value: { gen }, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
  } catch {
    /* app_cache opcional */
  }
}

/** Invalidación completa post-scrape / post-precompute */
export async function invalidateAllPredictionCaches(): Promise<{ redis: boolean }> {
  await bumpPredictionCacheGeneration()
  const redis = await invalidateRedisPredictionCache()
  return { redis }
}
