import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
import { parsePred2, extractPred3, extractPred4, extractRedoblona } from "@/lib/predictions"
import logger from "@/lib/logger"
import type { PredictionResponse, TopNumero, HeatmapItem } from "./types"

export const maxDuration = 30

// ── In-memory prediction cache (survives warm serverless instances) ──
interface MemCacheEntry { payload: unknown; expiresAt: number }
const predictionMemCache = new Map<string, MemCacheEntry>()
const MEM_CACHE_TTL = 5 * 60 * 1000 // 5 minutes
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
    vespertina: "Vespertina", nocturna: "Nocturna"
  }
  return map[t.toLowerCase()] || t
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

    if (!["previa", "primera", "matutina", "vespertina", "nocturna"].includes(turnoQuery)) {
      return NextResponse.json({ error: `Sorteo inválido. Válidos: previa, primera, matutina, vespertina, nocturna` }, { status: 400 })
    }

    const turnoCanonical = normalizeTurno(turnoQuery)

    // ── Supabase client (service_role para saltarse RLS) ──
    const { getSupabaseAdmin } = await import('@/lib/supabase-client')
    const supabaseAdmin = getSupabaseAdmin()

    const todayBsAs = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
    const requestedDate = searchParams.get("date")
    const targetDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) ? requestedDate : todayBsAs

    // ── Cache invalidation (called by scrape webhook on success) ──
    if (searchParams.get("invalidate") === "1") {
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

    // ── 1. Leer del caché ultrarrápido (< 200ms) via service_role ──
    try {
      const { data: cached } = await supabaseAdmin
        .from("predictions_cache")
        .select("numeros_2, numeros_3, numeros_4, redoblona, engine_version, confidence, agreement_score, v6_weight, v7_weight, ml_weight")
        .eq("game_id", "ac593199-c299-4f03-b1b7-8675fe4fa6d9")
        .eq("date", targetDate)
        .eq("turno", turnoCanonical)
        .single()

      if (cached?.numeros_2 && Array.isArray(cached.numeros_2) && cached.numeros_2.length > 0) {
        // Cache hit — build response from pre-computed data
        const numeros: TopNumero[] = cached.numeros_2.map((item: Record<string, unknown>, i: number) => ({
          n: item.n as number,
          numero: item.numero as string,
          emoji: (item.emoji as string) || "❓",
          significado: (item.significado as string) || "",
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

        // ── LA BARRERA DE SEGURIDAD (Paywall Backend) ──
        // Si el usuario es Free, destruimos los datos Premium del payload
        // antes de enviarlos por red. Nunca viajan por HTTP.
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
          top3: numeros.slice(0, 3).map((n) => n.numero),
          _cached: true,
          debug: {
            elapsed_ms: 0,
            factores_aplicados: 10,
            motores_activos: 3,
            total_numeros: 10,
            determinista: true,
            sorteos_analizados: 0,
            dynamic_weights: { v6Weight: cached.v6_weight, v7Weight: cached.v7_weight, mlWeight: cached.ml_weight },
          },
        }

        // ═══ CRYPGRAPHIC FIELD DESTRUCTION ═══
        // Si el usuario es Free, eliminamos criptográficamente los campos
        // Premium del objeto JS. Estos datos NUNCA llegan al client.
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

        // Store in memory + Redis cache
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

    // ── CACHE MISS: No pre-computed data available ──
    const elapsed = Date.now() - t0
    logger.warn("[predictions] Cache miss — no pre-computed data", {
      date: targetDate,
      turno: turnoCanonical,
      elapsed,
    })

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

    if (rpcError) throw rpcError

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
