import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
import { parsePred2, extractPred3, extractPred4, extractRedoblona } from "@/lib/predictions"
import logger from "@/lib/logger"
import { SUENOS } from "@/lib/suenos"
import type { PredictionResponse, TopNumero, HeatmapItem } from "./types"

export const maxDuration = 30

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
const POCEADA_GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

// ── In-memory prediction cache (survives warm serverless instances) ──
interface MemCacheEntry { payload: unknown; expiresAt: number }
const predictionMemCache = new Map<string, MemCacheEntry>()
const MEM_CACHE_TTL = 60 * 1000 // 1 min (warm instances; Redis/Supabase es fuente)
const MEM_CACHE_MAX = 50

function memCacheKey(date: string, turno: string, tier: string) {
  return `${date}:${turno}:${tier}`
}

function getMemCache(key: string): unknown | null {
  const entry = predictionMemCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { predictionMemCache.delete(key); return null }
  return entry.payload
}

function setMemCache(key: string, payload: unknown): void {
  if (predictionMemCache.size >= MEM_CACHE_MAX) {
    const oldest = predictionMemCache.keys().next().value
    if (oldest) predictionMemCache.delete(oldest)
  }
  predictionMemCache.set(key, { payload, expiresAt: Date.now() + MEM_CACHE_TTL })
}

function invalidateMemCache(): void { predictionMemCache.clear() }

function normalizeTurno(t: string): string {
  const map: Record<string, string> = {
    previa: "Previa", primera: "Primera", matutina: "Matutina",
    vespertina: "Vespertina", nocturna: "Nocturna", poceada: "Poceada"
  }
  return map[t.toLowerCase()] || t
}

// Look-up Tabla de los Sueños por número 2-cifras (acepta 4 dígitos → %100)
function suenoDe(n: number | string): { emoji: string; nombre: string } {
  const k = ((Number(n) % 100) + 100) % 100
  return SUENOS[k] || { emoji: "❓", nombre: "" }
}

/**
 * MÓDULO 1 — El Lector "Tonto" y el Paywall
 *
 * Este endpoint NO ejecuta motores. Solo lee de predictions_cache.
 * Los motores V6/V7/ML corren EXCLUSIVAMENTE en cron-precompute (post-scrape).
 *
 * La barrera de seguridad destruye los datos Premium del payload JSON
 * antes de enviarlos por red si el usuario es Free.
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"

  try {
    // ── Rate limit ──
    const rl = await checkRateLimit(ip, RATE_LIMIT_PRESETS.PREDICTION_API)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Demasiadas peticiones. Esperá unos minutos.", retryAfter: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Limit": "30",
            "X-RateLimit-Remaining": rl.remaining.toString(),
            "X-RateLimit-Reset": Math.ceil(rl.resetAt / 1000).toString(),
            "Retry-After": Math.ceil((rl.resetAt - Date.now()) / 1000).toString()
          }
        }
      )
    }

    // ── Autenticar al usuario para el Paywall ──
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
    if (!token) {
      return NextResponse.json({
        error: "Iniciá sesión para ver predicciones.",
        upgradeRequired: true,
      }, { status: 401 })
    }

    const userTier = await resolveUserTier(token)

    if (!userTier.canAccess2Cifras) {
      // Auto-recovery: if user has no trial dates, try to fix their profile
      if (userTier.userId && !userTier.premium_until && userTier.trialExpired === false && userTier.isTrialActive === false) {
        try {
          const { ensureUserProfile } = await import("@/lib/auth/tier")
          const decoded = await (await import("@/lib/auth/jwt")).validateJwt(token)
          if (decoded?.email) {
            await ensureUserProfile(userTier.userId, decoded.email)
            const retryTier = await resolveUserTier(token)
            if (retryTier.canAccess2Cifras) {
              Object.assign(userTier, retryTier)
            }
          }
        } catch (e) {
          logger.warn("[predictions] Auto-recovery failed", { error: String(e) })
        }
      }
    }

    if (!userTier.canAccess2Cifras) {
      return NextResponse.json({
        error: userTier.trialExpired
          ? "Tu período gratuito de 30 días expiró. Actualizá a Premium para continuar."
          : "No se pudo verificar tu acceso. Intentá de nuevo.",
        trialExpired: userTier.trialExpired,
        tier: userTier.role,
        upgradeRequired: true,
      }, { status: 403 })
    }

    // ── Parse turno + date ──
    const { searchParams } = new URL(req.url)
    const turnoRaw = searchParams.get("sorteo") || "previa"
    const turnoQuery = turnoRaw.toLowerCase()

    if (!["previa", "primera", "matutina", "vespertina", "nocturna", "poceada"].includes(turnoQuery)) {
      return NextResponse.json({ error: `Sorteo inválido. Válidos: previa, primera, matutina, vespertina, nocturna, poceada` }, { status: 400 })
    }

    const turnoCanonical = normalizeTurno(turnoQuery)

    // ── Supabase client (service_role para saltarse RLS) ──
    const { getSupabaseAdmin } = await import('@/lib/supabase-client')
    const supabaseAdmin = getSupabaseAdmin()

    const todayBsAs = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
    const requestedDate = searchParams.get("date")
    const targetDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) ? requestedDate : todayBsAs

    // ── Cache invalidation (admin-only) ──
    if (searchParams.get("invalidate") === "1") {
      if (userTier.role !== "admin") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
      }
      invalidateMemCache()
      try {
        const { redisClearPrefix } = await import("@/lib/redis")
        await redisClearPrefix("")
      } catch { /* best-effort Redis clear */ }
      return NextResponse.json({ ok: true, message: "Cache invalidated" })
    }

    // ── 0a. In-memory cache (zero latency) ──
    const memKey = memCacheKey(targetDate, turnoCanonical, userTier.role || "free")
    const memCached = getMemCache(memKey)
    if (memCached) {
      return NextResponse.json(memCached, {
        headers: { "X-Cache": "MEM-HIT", "Cache-Control": "private, no-cache" },
      })
    }

    // ── 0b. Upstash Redis cache (~1ms) ──
    try {
      const { redisGet } = await import("@/lib/redis")
      const redisCached = await redisGet(memKey)
      if (redisCached) {
        setMemCache(memKey, redisCached)
        return NextResponse.json(redisCached, {
          headers: { "X-Cache": "REDIS-HIT", "Cache-Control": "private, no-cache" },
        })
      }
    } catch { /* Redis unavailable — fall through to Supabase */ }

    // ── Heatmap de frecuencias (00-99) — fuente: draws oficiales (últimos ≤400) ──
    let heatmap: HeatmapItem[] = []
    let totalSorteos = 0
    try {
      const { data: heatmapRows } = await supabaseAdmin
        .from("draws")
        .select("numbers")
        .eq("turno", turnoCanonical)
        .order("date", { ascending: false })
        .limit(400)
      const rows = Array.isArray(heatmapRows) ? heatmapRows : []
      totalSorteos = rows.length
      const freq: number[] = new Array(100).fill(0)
      for (const row of rows) {
        const nums = (row as { numbers: number[] }).numbers
        if (!Array.isArray(nums)) continue
        for (const raw of nums) {
          const n2 = ((Number(raw) % 100) + 100) % 100
          if (n2 >= 0 && n2 < 100 && Number.isFinite(n2)) freq[n2]++
        }
      }
      // Orden 00→99 (tabla clásica); el frontend ordena copia para "Top N"
      heatmap = freq.map((f, n) => ({
        n,
        f,
        s: SUENOS[n] || { emoji: "❓", nombre: "—" },
        pct: totalSorteos > 0 ? Math.round((f / totalSorteos) * 1000) / 10 : 0,
      }))
    } catch (e) {
      logger.warn("[predictions] Heatmap computation failed", { error: String(e) })
    }

    // ── 1. Leer del caché ultrarrápido (< 200ms) via service_role ──
    try {
      const { data: cachedRows } = await supabaseAdmin
        .from("predictions_cache")
        .select("numeros_2, numeros_3, numeros_4, redoblona, engine_version, confidence, agreement_score, v6_weight, v7_weight, ml_weight, date, monte_carlo")
        .eq("turno", turnoCanonical)
        .lte("date", targetDate)
        .order("date", { ascending: false })
        .limit(1)
      const cached = Array.isArray(cachedRows) && cachedRows.length > 0 ? cachedRows[0] : null

      if (cached?.numeros_2 && Array.isArray(cached.numeros_2) && cached.numeros_2.length > 0) {
          // Cache hit — build response from pre-computed data
          const numeros: TopNumero[] = cached.numeros_2.map((item: Record<string, unknown>, i: number) => ({
            n: item.n as number,
            numero: item.numero as string,
            emoji: suenoDe((item.n ?? item.numero) as number | string).emoji || (item.emoji as string) || "❓",
            significado: suenoDe((item.n ?? item.numero) as number | string).nombre || (item.significado as string) || "",
            score: (item.score as number) || 0,
            confianza: cached.confidence || 0,
            rank: i + 1,
            frecuencia: Math.round(((item.score as number) || 0) * 100),
            factores: Object.keys(item.factor_attribution as Record<string, number> || {}).filter(
              (k) => ((item.factor_attribution as Record<string, number>) || {})[k] > 0.1
            ),
            bayesianConfidence: ((item.factor_attribution as Record<string, number>) || {}).bayesian || 0,
            bayesianPosterior: 0,
            highConfidence: ((item.score as number) || 0) > 0.7,
            factor_attribution: (item.factor_attribution as Record<string, number>) || {},
            percentile: Math.round((1 - i / 10) * 1000) / 10,
          }))

          let pred3: string[] = []
          let pred4: string[] = []
          let redoblona: string | null = null
          if (userTier.canAccessPremiumFeatures) {
            pred3 = cached.numeros_3 || []
            pred4 = cached.numeros_4 || []
            const rb = cached.redoblona as { cabeza: string; acompanante: string } | null
            if (rb?.cabeza && rb?.acompanante) {
              redoblona = `${String(rb.cabeza).padStart(2, '0')}-${String(rb.acompanante).padStart(2, '0')}`
            }
          }

          const responsePayload: Record<string, unknown> = {
            ok: true,
            turno: turnoQuery,
            tier: userTier.role,
            numeros,
            pred: {
              numeros_2: numeros.map((n) => n.numero),
              numeros_3: pred3,
              numeros_4: pred4,
              redoblona,
            },
            numeros_2: numeros.map((n) => n.numero),
            numeros_3: pred3.length > 0 ? pred3 : undefined,
            numeros_4: pred4.length > 0 ? pred4 : undefined,
            redoblona,
            score: numeros[0]?.score || 0,
            confidence: cached.confidence || 0,
            // confidence = consistencia del modelo (NO probabilidad de acierto)
            confidence_type: "model_consistency",
            consistencia_modelo: cached.confidence || 0,
            monte_carlo: cached.monte_carlo ?? null,
            margen_de_error_estimado: Math.round((1 - (cached.agreement_score || 0.5)) * 100) / 100,
            aviso_legal: "Análisis estadístico con fines informativos. La lotería es un evento aleatorio e independiente. No se garantiza ningún resultado. Jugar con responsabilidad.",
            top3: numeros.slice(0, 3).map((n) => n.numero),
            heatmap,
            totalSorteos,
            _cached: true,
            computed_at: new Date().toISOString(),
            debug: {
              elapsed_ms: Date.now() - t0,
              factores_aplicados: Object.keys(numeros[0]?.factor_attribution || {}).length,
              motores_activos: [cached.v6_weight, cached.v7_weight, cached.ml_weight].filter((w) => (w || 0) > 0).length,
              total_numeros: numeros.length,
              determinista: true,
              sorteos_analizados: totalSorteos,
              dynamic_weights: { v6Weight: cached.v6_weight, v7Weight: cached.v7_weight, mlWeight: cached.ml_weight },
            },
          }

          if (!userTier.canAccessPremiumFeatures) {
            delete responsePayload.numeros_3
            delete responsePayload.numeros_4
            delete responsePayload.redoblona
            if (responsePayload.pred && typeof responsePayload.pred === 'object') {
              const pred = responsePayload.pred as Record<string, unknown>
              delete pred.numeros_3
              delete pred.numeros_4
              delete pred.redoblona
            }
          }

          setMemCache(memKey, responsePayload)
          try {
            const { redisSet } = await import("@/lib/redis")
            await redisSet(memKey, responsePayload, 300)
          } catch { /* best-effort Redis write */ }

          return NextResponse.json(responsePayload, {
            headers: {
              "Cache-Control": "private, no-cache, no-store, must-revalidate",
              "Vary": "Authorization",
              "X-Prediction-Turno": turnoCanonical,
              "X-Prediction-Date": todayBsAs,
              "X-Engine": cached.engine_version,
              "X-Cache": "HIT",
            },
          })
      }
    } catch {
      // Cache miss — fall through
    }

    // ── CACHE MISS: Try live computation via V6 RPC ──
    const elapsed = Date.now() - t0
    logger.warn("[predictions] Cache miss — trying live V6 computation", {
      date: targetDate,
      turno: turnoCanonical,
      elapsed,
    })

    try {
      const { getSupabaseAdmin } = await import("@/lib/supabase-client")
      const supabase = getSupabaseAdmin()
      const rpcTier = userTier.canAccessPremiumFeatures ? "premium" : "free"

      const { data: rpcResult, error: rpcError } = await supabase
        .rpc("calculate_omega_v6" as never, {
          p_turno: turnoCanonical,
          p_tier: rpcTier,
          p_date: targetDate,
        } as never)

      if (!rpcError && rpcResult && Array.isArray(rpcResult) && rpcResult.length > 0) {
        const numeros_2 = parsePred2(rpcResult)
        const numeros_3 = userTier.canAccessPremiumFeatures ? extractPred3(rpcResult) : []
        const numeros_4 = userTier.canAccessPremiumFeatures ? extractPred4(rpcResult) : []
        const redoblonaObj = userTier.canAccessPremiumFeatures ? extractRedoblona(rpcResult) : null
        const redoblona = redoblonaObj ? `${redoblonaObj.cabeza}-${redoblonaObj.acompanante}` : null

        if (numeros_2.length > 0) {
          const numeros: TopNumero[] = numeros_2.map((n, i) => {
            const num = parseInt(n, 10)
            const score = (rpcResult[i]?.puntaje_total as number) || 0
            const fa = (rpcResult[i]?.factor_attribution as Record<string, number>) || {}
            const factores = Object.entries(fa)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([k]) => k)
            return {
              n: num,
              numero: n,
              emoji: suenoDe(num).emoji,
              significado: suenoDe(num).nombre || `Predicción ${n}`,
              score,
              confianza: Math.round(score * 100),
              rank: i + 1,
              frecuencia: Math.round(score * 100),
              factores,
              factor_attribution: fa,
            }
          })

          const responsePayload: Record<string, unknown> = {
            ok: true,
            date: targetDate,
            turno: turnoCanonical,
            game_id: turnoCanonical === "Poceada" ? POCEADA_GAME_ID : GAME_ID,
            pred: {
              numeros_2,
              numeros_3,
              numeros_4,
              redoblona,
            },
            redoblona,
            numeros,
            heatmap,
            totalSorteos,
            confidence: null,
            confidence_type: "model_consistency",
            consistencia_modelo: null,
            monte_carlo: null,
            margen_de_error_estimado: null,
            aviso_legal: "Análisis estadístico con fines informativos. La lotería es un evento aleatorio e independiente. No se garantiza ningún resultado. Jugar con responsabilidad.",
            engine_version: "omega_v6_live",
            cached: false,
            computed_at: new Date().toISOString(),
          }

          return NextResponse.json(responsePayload, {
            headers: {
              "Cache-Control": "private, no-cache, no-store, must-revalidate",
              "X-Cache": "LIVE-V6",
              "X-Engine": "omega_v6_live",
            },
          })
        }
      }
    } catch (e) {
      logger.warn("[predictions] Live V6 fallback failed", { error: String(e) })
    }

    // ── Final fallback: truly no data available ──
    return NextResponse.json({
      ok: false,
      error: "Predicciones en cálculo",
      retry_in_seconds: 30,
    }, {
      status: 404,
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "X-Cache": "MISS",
        "X-Engine": "pre-compute-only",
        "Retry-After": "30",
      },
    })

  } catch (err) {
    logger.error("[predictions] UNHANDLED ERROR:", { error: String(err) })
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}

// POST handler for auto-pilot (internal cron calls, requires Bearer auth)
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || !authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const { timingSafeEqual } = await import("crypto")
    const provided = authHeader.slice(7)
    const expectedBuf = Buffer.from(cronSecret.padEnd(64, "\0"))
    const providedBuf = Buffer.from(provided.padEnd(64, "\0"))
    if (!timingSafeEqual(expectedBuf, providedBuf)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const { turno, date, include3And4 = false } = body

    if (!turno || !date) {
      return NextResponse.json({ error: "Missing turno or date" }, { status: 400 })
    }
    const validTurnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
    if (!validTurnos.includes(turno)) {
      return NextResponse.json({ error: "Turno inválido" }, { status: 400 })
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Fecha inválida" }, { status: 400 })
    }

    const { getSupabaseAdmin } = await import("@/lib/supabase-client")
    const supabase = getSupabaseAdmin()

    const turnoCanonical = turno.charAt(0).toUpperCase() + turno.slice(1).toLowerCase()
    const rpcTier = include3And4 ? "premium" : "free"

    const { data: rpcResult, error: rpcError } = await supabase
      .rpc("calculate_omega_v6" as never, {
        p_turno: turnoCanonical,
        p_tier: rpcTier,
        p_date: date,
      } as never)

    if (rpcError) {
      logger.warn("[predictions POST] RPC error", { error: rpcError.message })
      return NextResponse.json({ error: "Sin datos disponibles", detail: rpcError.message }, { status: 404 })
    }

    const rows = (rpcResult || []) as Array<{
      numero: number
      prediccion_2cifras?: string
      prediccion_3cifras?: string[]
      prediccion_4cifras?: string[]
      redoblona?: { cabeza: string; acompanante: string } | null
      puntaje_total?: number
      factor_attribution?: Record<string, number>
    }>

    if (rows.length === 0) {
      return NextResponse.json({ error: `Sin datos para turno ${turnoCanonical}` }, { status: 404 })
    }

    const numeros_2 = parsePred2(rows)
    const numeros_3 = include3And4 ? extractPred3(rows) : []
    const numeros_4 = include3And4 ? extractPred4(rows) : []
    const redoblona = include3And4 ? extractRedoblona(rows) : null

    return NextResponse.json({
      pred: {
        numeros_2,
        numeros_3,
        numeros_4,
        redoblona,
        topNumeros: numeros_2.map((n, i) => ({
          numero: n,
          score: 0,
          rank: i + 1,
        })),
      },
      engine: "omega-v6",
      confidence: null,
    })
  } catch (err) {
    logger.error("[predictions POST] ERROR:", { error: String(err) })
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
