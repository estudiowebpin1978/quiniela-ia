import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { generatePredictionSummary } from "@/lib/ai/summary"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
import { predictEnsembleV7 } from "@/lib/analisis/engine-v7"
import { loadV7Weights, v7WeightsToFactorBreakdown } from "@/lib/analisis/v7-weights"
import { getMLPredictions } from "@/lib/ml/integration"
import { loadEngineWeights } from "@/lib/ensemble/meta-ensemble"
import logger from "@/lib/logger"
import type { Draw } from "@/lib/analisis/engine-v7"
import type { PredictionResponse, TopNumero, HeatmapItem } from "./types"

export const maxDuration = 30

const SUENOS: Record<number, { emoji: string; nombre: string }> = {
  0: { emoji: "🥚", nombre: "Huevos" }, 1: { emoji: "💧", nombre: "Agua" }, 2: { emoji: "👶", nombre: "Niño" },
  3: { emoji: "🐰", nombre: "San Cono" }, 4: { emoji: "🛏️", nombre: "La cama" }, 5: { emoji: "🐱", nombre: "Gato" },
  6: { emoji: "🐕", nombre: "Perro" }, 7: { emoji: "🔫", nombre: "Revolver" }, 8: { emoji: "🔥", nombre: "Incendio" },
  9: { emoji: "🌊", nombre: "Arroyo" }, 10: { emoji: "🥛", nombre: "Leche" }, 11: { emoji: "⛏️", nombre: "Minero" },
  12: { emoji: "💂", nombre: "Soldado" }, 13: { emoji: "😱", nombre: "Yeta" }, 14: { emoji: "🍺", nombre: "Borracho" },
  15: { emoji: "👸", nombre: "Niña Bonita" }, 16: { emoji: "💍", nombre: "Anillo" }, 17: { emoji: "💀", nombre: "Desgracia" },
  18: { emoji: "🩸", nombre: "Sangre" }, 19: { emoji: "🐟", nombre: "Pescado" }, 20: { emoji: "🎉", nombre: "La fiesta" },
  21: { emoji: "👩", nombre: "Mujer" }, 22: { emoji: "🤪", nombre: "Loco" }, 23: { emoji: "👨‍🍳", nombre: "Cocinero" },
  24: { emoji: "🐴", nombre: "Caballo" }, 25: { emoji: "🐔", nombre: "Gallina" }, 26: { emoji: "⛪", nombre: "La misa" },
  27: { emoji: "🪮", nombre: "Peine" }, 28: { emoji: "⛰️", nombre: "Cerro" }, 29: { emoji: "✝️", nombre: "San Pedro" },
  30: { emoji: "🌹", nombre: "Santa Rosa" }, 31: { emoji: "💡", nombre: "Luz" }, 32: { emoji: "💰", nombre: "Dinero" },
  33: { emoji: "✝️", nombre: "Cristo" }, 34: { emoji: "🤕", nombre: "Cabeza" }, 35: { emoji: "🐦", nombre: "Pajarito" },
  36: { emoji: "🧈", nombre: "Manteca" }, 37: { emoji: "🦷", nombre: "Dentista" }, 38: { emoji: "🪨", nombre: "Piedras" },
  39: { emoji: "🌧️", nombre: "Lluvia" }, 40: { emoji: "⛪", nombre: "Cura" }, 41: { emoji: "🔪", nombre: "Cuchillo" },
  42: { emoji: "👟", nombre: "Zapatillas" }, 43: { emoji: "🏠", nombre: "Balcón" }, 44: { emoji: "🏚️", nombre: "Cárcel" },
  45: { emoji: "🍷", nombre: "Vino" }, 46: { emoji: "🍅", nombre: "Tomates" }, 47: { emoji: "💀", nombre: "Muerto" },
  48: { emoji: "🧟", nombre: "Muerto habla" }, 49: { emoji: "🥩", nombre: "Carne" }, 50: { emoji: "🍞", nombre: "Pan" },
  51: { emoji: "🪚", nombre: "Serrucho" }, 52: { emoji: "👩‍👦", nombre: "Madre" }, 53: { emoji: "⛵", nombre: "Barco" },
  54: { emoji: "🐄", nombre: "Vaca" }, 55: { emoji: "🎵", nombre: "Música" }, 56: { emoji: "🤕", nombre: "Caída" },
  57: { emoji: "🏃", nombre: "Jorobado" }, 58: { emoji: "💦", nombre: "Ahogado" }, 59: { emoji: "🌱", nombre: "Plantas" },
  60: { emoji: "🧝", nombre: "Virgen" }, 61: { emoji: "🔫", nombre: "Escopeta" }, 62: { emoji: "🌊", nombre: "Inundación" },
  63: { emoji: "💒", nombre: "Casamiento" }, 64: { emoji: "😢", nombre: "Llanto" }, 65: { emoji: "🎯", nombre: "Cazador" },
  66: { emoji: "🪱", nombre: "Lombrices" }, 67: { emoji: "🐍", nombre: "Víbora" }, 68: { emoji: "👶", nombre: "Sobrinos" },
  69: { emoji: "😈", nombre: "Vicios" }, 70: { emoji: "💀", nombre: "Muerto sueño" }, 71: { emoji: "💩", nombre: "Excremento" },
  72: { emoji: "🎁", nombre: "Sorpresa" }, 73: { emoji: "🏥", nombre: "Hospital" }, 74: { emoji: "🏿", nombre: "Gente negra" },
  75: { emoji: "💋", nombre: "Besos" }, 76: { emoji: "🔥", nombre: "Fuego" }, 77: { emoji: "🦵", nombre: "Pierna" },
  78: { emoji: "💃", nombre: "Ramera" }, 79: { emoji: "🦹", nombre: "Ladrón" }, 80: { emoji: "🎱", nombre: "Bochas" },
  81: { emoji: "💐", nombre: "Flores" }, 82: { emoji: "🥊", nombre: "Pelea" }, 83: { emoji: "⛈️", nombre: "Mal tiempo" },
  84: { emoji: "⛪", nombre: "Iglesia" }, 85: { emoji: "🔦", nombre: "Linterna" }, 86: { emoji: "💨", nombre: "Humo" },
  87: { emoji: "🦟", nombre: "Piojos" }, 88: { emoji: "🥔", nombre: "Papas" }, 89: { emoji: "🐀", nombre: "Rata" },
  90: { emoji: "😱", nombre: "Miedo" }, 91: { emoji: "🏕️", nombre: "Excursión" }, 92: { emoji: "👨‍⚕️", nombre: "Médico" },
  93: { emoji: "💕", nombre: "Enamorado" }, 94: { emoji: "🪦", nombre: "Cementerio" }, 95: { emoji: "👓", nombre: "Anteojos" },
  96: { emoji: "👨", nombre: "Marido" }, 97: { emoji: "🍽️", nombre: "Mesa" }, 98: { emoji: "👕", nombre: "Lavandera" },
  99: { emoji: "👦", nombre: "Hermano" }
}

function pad(n: number, l = 2): string {
  return String(n).padStart(l, '0')
}

function normalizeTurno(t: string): string {
  const map: Record<string, string> = {
    previa: "Previa", primera: "Primera", matutina: "Matutina",
    vespertina: "Vespertina", nocturna: "Nocturna"
  }
  return map[t.toLowerCase()] || t
}

interface OmegaRow {
  numero: number
  puntaje_total: number
  prediccion_2cifras: string
  prediccion_3cifras: string[] | null
  prediccion_4cifras: string[] | null
  redoblona: { cabeza: string; acompanante: string } | null
  factor_attribution: Record<string, number> | null
}

export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"

  try {
    // ── Rate limit ──────────────────────────────────────────────
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

    // ── Tier check ──────────────────────────────────────────────
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
            // Retry tier resolution
            const retryTier = await resolveUserTier(token)
            if (retryTier.canAccess2Cifras) {
              // Use the retried tier
              Object.assign(userTier, retryTier)
            }
          }
        } catch {}
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

    // ── Parse turno + date ──────────────────────────────────────
    const { searchParams } = new URL(req.url)
    const turnoRaw = searchParams.get("sorteo") || "previa"
    const turnoQuery = turnoRaw.toLowerCase()

    if (!["previa", "primera", "matutina", "vespertina", "nocturna"].includes(turnoQuery)) {
      return NextResponse.json({ error: `Sorteo inválido. Válidos: previa, primera, matutina, vespertina, nocturna` }, { status: 400 })
    }

    const turnoCanonical = normalizeTurno(turnoQuery)

    // ── Supabase client ─────────────────────────────────────────
    const { getSupabaseAdmin } = await import('@/lib/supabase-client')
    const supabaseAdmin = getSupabaseAdmin()

    const todayBsAs = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
    // Accept `date` param from client, fallback to today
    const requestedDate = searchParams.get("date")
    const targetDate = (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) ? requestedDate : todayBsAs

    // ── 0. Try pre-computed cache first (< 200ms) ─────────────
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

        // Premium: add 3/4 cifras from cache if available
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

        const responsePayload = {
          ok: true as const,
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
          _computedAt: undefined,
          debug: {
            elapsed_ms: 0,
            factores_aplicados: 10,
            motores_activos: 3,
            total_numeros: 10,
            determinista: true,
            sorteos_analizados: 0,
            sync: null,
            cdm_model: { activo: false, topNumeros: [] },
            advanced_analytics: {},
            dynamic_weights: { v6Weight: cached.v6_weight, v7Weight: cached.v7_weight, mlWeight: cached.ml_weight },
            v7_engine: { ensemble_size: 0, v6_weight: cached.v6_weight, v7_weight: cached.v7_weight, ml_weight: cached.ml_weight, adaptive: true, total_evaluations: 0 },
            ml_engine: { models_loaded: 3, prediction_time_ms: 0 },
          },
        }

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
      // Cache miss — fall through to on-demand computation
    }

    // ── Determine RPC tier param ────────────────────────────────
    const rpcTier = userTier.canAccessPremiumFeatures ? 'premium' : 'free'

    // ── Build EngineContext: the "snapshot of reality" ──────────
    const { data: lastDraw } = await supabaseAdmin
      .from('draws')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!lastDraw) {
      return NextResponse.json({ error: "Sin datos en la base." }, { status: 404 })
    }

    const lastDrawId = lastDraw.id as number
    const ctxSeed = ((lastDrawId * 31 + turnoCanonical.length * 17) | 0) % 100000

    // ── On-demand engine computation (fallback) ─────────────────
    // Only runs if pre-computed cache is unavailable
    // All draws filtered by id <= lastDrawId for determinism
    const [rpcResult, drawsResult, v7Result, mlResult] = await Promise.all([
      supabaseAdmin.rpc('calculate_omega_v6', {
        p_turno: turnoCanonical,
        p_tier: rpcTier,
        p_date: targetDate,
      }),
      supabaseAdmin
        .from('draws')
        .select('id', { count: 'exact', head: true })
        .eq('turno', turnoCanonical)
        .lte('id', lastDrawId),
      // V7 Engine: scoped to lastDrawId
      (async () => {
        try {
          const [histResult, v7Weights] = await Promise.all([
            supabaseAdmin
              .from('draws')
              .select('id, date, turno, numbers')
              .eq('turno', turnoCanonical)
              .lte('id', lastDrawId)
              .order('date', { ascending: true }),
            loadV7Weights(turnoCanonical),
          ])
          if (!histResult.data || histResult.data.length < 20) return null
          const draws: Draw[] = histResult.data.map((d: Record<string, unknown>) => ({
            fecha: d.date as string,
            turno: d.turno as string,
            numbers: d.numbers as number[],
          }))
          const weights = v7WeightsToFactorBreakdown(v7Weights)
          const v7Result = await predictEnsembleV7(draws, turnoCanonical, 10, ctxSeed)
          return { ...v7Result, adaptiveWeights: v7Weights }
        } catch (e) {
          logger.warn("[predictions] V7 engine failed:", { error: String(e) })
          return null
        }
      })(),
      // ML Engine: scoped to lastDrawId
      (async () => {
        try {
          const { data: histDraws } = await supabaseAdmin
            .from('draws')
            .select('id, date, turno, numbers')
            .eq('turno', turnoCanonical)
            .lte('id', lastDrawId)
            .order('date', { ascending: true })
          if (!histDraws || histDraws.length < 10) return null
          const draws = histDraws.map((d: Record<string, unknown>) => ({
            fecha: d.date as string,
            turno: d.turno as string,
            numbers: d.numbers as number[],
          }))
          return getMLPredictions(turnoCanonical, draws)
        } catch (e) {
          logger.warn("[predictions] ML engine failed:", { error: String(e) })
          return null
        }
      })(),
    ])

    if (rpcResult.error) {
      logger.error("[predictions] RPC error:", { error: rpcResult.error.message })
      return NextResponse.json(
        { error: "Error calculando predicciones. Intentá de nuevo." },
        { status: 500 }
      )
    }

    const rows: OmegaRow[] = (rpcResult.data || []) as unknown as OmegaRow[]
    const totalSorteos = (drawsResult.count as number) || 0

    if (rows.length === 0) {
      return NextResponse.json({
        error: `Sin datos para turno ${turnoQuery}.`,
        turno: turnoQuery,
      }, { status: 404 })
    }

    // ── 2. Build pred2 from RPC ──────────────────────────────────
    const firstRow = rows[0]
    const pred2: string[] = []
    if (firstRow?.prediccion_2cifras) {
      for (const n of firstRow.prediccion_2cifras.split(',')) {
        pred2.push(n.trim().padStart(2, '0'))
      }
    }

    if (pred2.length === 0) {
      for (const r of rows.slice(0, 10)) {
        if (r.prediccion_2cifras) pred2.push(r.prediccion_2cifras.padStart(2, '0'))
      }
    }

    // ── 3. Build numeros: blend V6 + V7 scores ──────────────────────
    // V6 scores (SQL engine)
    const v6Scores = new Map<number, { score: number; fa: Record<string, number> }>()
    for (const r of rows.slice(0, 20)) {
      v6Scores.set(r.numero, { score: r.puntaje_total || 0, fa: r.factor_attribution || {} })
    }

    // V7 scores (TypeScript engine)
    const v7Scores = new Map<number, number>()
    if (v7Result?.predictions) {
      for (const pred of v7Result.predictions) {
        v7Scores.set(parseInt(pred.numero), pred.score)
      }
    }

    // ML scores (trained models)
    const mlScores = mlResult?.available ? mlResult.scores : new Map<number, number>()
    const hasML = mlScores.size > 0

    // Blend: dynamic weights from engine_performance
    const engineW = await loadEngineWeights(turnoCanonical)
    const allNums = new Set([...v6Scores.keys(), ...v7Scores.keys(), ...mlScores.keys()])
    const hasV7 = v7Scores.size > 0

    const blended: Array<{ num: number; blendedScore: number; v6Score: number; v7Score: number; mlScore: number; fa: Record<string, number> }> = []
    for (const num of allNums) {
      const v6 = v6Scores.get(num)
      const v7 = v7Scores.get(num) || 0
      const ml = mlScores.get(num) || 0
      const v6Score = v6?.score || 0
      const blendedScore = v6Score * engineW.V6 + v7 * engineW.V7 + ml * engineW.ML
      blended.push({ num, blendedScore, v6Score, v7Score: v7, mlScore: ml, fa: v6?.fa || {} })
    }

    blended.sort((a, b) => b.blendedScore - a.blendedScore)

    const numeros: TopNumero[] = blended.slice(0, 10).map((item, i) => ({
      n: item.num,
      numero: pad(item.num),
      emoji: SUENOS[item.num]?.emoji || "❓",
      significado: SUENOS[item.num]?.nombre || "",
      score: item.blendedScore,
      confianza: 0,
      rank: i + 1,
      frecuencia: Math.round(item.v6Score * 100),
      factores: Object.entries(item.fa).filter(([,v]) => v > 0.1).map(([k]) => k),
      bayesianConfidence: item.fa.bayesian || 0,
      bayesianPosterior: 0,
      highConfidence: item.blendedScore > 0.7,
      factor_attribution: { ...item.fa, v6_score: item.v6Score, v7_score: item.v7Score, ml_score: item.mlScore },
      percentile: Math.round((1 - i / 10) * 1000) / 10,
    }))

    // ── 4. Confidence from historical backtest (not fake) ─────────
    // Get the best backtest result for this turno to determine real confidence
    let confidence = 50 // fallback
    try {
      const { data: btData } = await supabaseAdmin.rpc('backtest_v6' as never, {
        p_turno: turnoCanonical,
        p_start_date: '2025-05-05',
        p_end_date: new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }),
      } as never)
      if (btData && Array.isArray(btData) && btData.length > 0) {
        // top10_hit_rate from backtest is the real hit rate
        confidence = Math.min(Math.round(btData[0].top10_hit_rate || 50), 95)
      }
    } catch {
      // If backtest fails, use a conservative default
      confidence = 50
    }

    // ── 5. Redoblona + 3/4 cifras (premium only) ───────────────
    let redoblona: string | null = null
    let pred3: string[] = []
    let pred4: string[] = []

    if (userTier.canAccessPremiumFeatures && firstRow) {
      const rb = firstRow.redoblona
      if (rb?.cabeza && rb?.acompanante) {
        redoblona = `${String(rb.cabeza).padStart(2, '0')}-${String(rb.acompanante).padStart(2, '0')}`
      }

      if (Array.isArray(firstRow.prediccion_3cifras)) {
        pred3 = firstRow.prediccion_3cifras.map(p => String(p).padStart(3, '0')).slice(0, 10)
      }

      if (Array.isArray(firstRow.prediccion_4cifras)) {
        pred4 = firstRow.prediccion_4cifras.map(p => String(p).padStart(4, '0')).slice(0, 10)
      }
    }

    // ── 6. Heatmap ──────────────────────────────────────────────
    const heatmap: HeatmapItem[] = numeros.map((num) => ({
      n: num.n,
      f: num.frecuencia,
      s: SUENOS[num.n] || { emoji: "❓", nombre: "" },
      pct: Number((num.score * 100).toFixed(1)),
    }))

    // ── 7. Stats ────────────────────────────────────────────────
    const stats = {
      totalNumeros: totalSorteos,
      promedioPorSorteo: totalSorteos > 0 ? "20.00" : "0",
      numeroMasFrecuente: numeros.length > 0
        ? { numero: numeros[0].numero, frecuencia: numeros[0].frecuencia, significado: numeros[0].significado }
        : { numero: "00", frecuencia: 0, significado: "" },
      terminacionesMasFrecuentes: numeros.slice(0, 5).map((n) => ({
        terminacion: n.n,
        frecuencia: n.frecuencia,
        score: (n.score * 100).toFixed(2),
      })),
    }

    // ── 8. AI Summary ───────────────────────────────────────────
    let aiSummary: { summary: string; provider: string } | null = null
    try {
      aiSummary = await generatePredictionSummary({
        turno: turnoQuery,
        top2: pred2,
        confidence,
        totalSorteos,
        factoresDestacados: numeros.slice(0, 3).flatMap((t: TopNumero) => t.factores || []).slice(0, 5),
      }, 2000)
    } catch {}

    // ── 9. Build response ──────────────────────────────────────
    const elapsed = Date.now() - t0

    const responsePayload: PredictionResponse & { numeros_2?: string[]; numeros_3?: string[]; numeros_4?: string[] } = {
      ok: true,
      turno: turnoQuery,
      tier: userTier.role,
      isPremium: userTier.isPremium,
      isTrialActive: userTier.isTrialActive,
      trialExpired: userTier.trialExpired,
      predictionsUsed: userTier.predictionsUsed,
      predictionsRemaining: userTier.predictionsRemaining,
      canAccessPremiumFeatures: userTier.canAccessPremiumFeatures,
      upgradeHint: !userTier.canAccessPremiumFeatures
        ? "Premium desbloquea 3 cifras, 4 cifras y redoblona con co-aparición histórica."
        : null,
      aiSummary: aiSummary?.summary || null,
      aiProvider: aiSummary?.provider || null,
      debug: {
        elapsed_ms: elapsed,
        factores_aplicados: hasV7 ? 19 : 9,
        motores_activos: hasV7 ? 19 : 9,
        total_numeros: totalSorteos * 20,
        determinista: true,
        sorteos_analizados: totalSorteos,
        sync: null,
        cdm_model: { activo: false, topNumeros: [] },
        advanced_analytics: {
          entropy: null, survival: null, interTurno: null,
          genetic: null, cachedAnalytics: null,
        },
        dynamic_weights: {
          frequency: numeros[0]?.factor_attribution?.frequency || 0.18,
          markov: numeros[0]?.factor_attribution?.markov || 0.15,
          hot: numeros[0]?.factor_attribution?.hot || 0.18,
          cold: numeros[0]?.factor_attribution?.cold || 0.12,
          gap: numeros[0]?.factor_attribution?.gap || 0.10,
          cooccurrence: numeros[0]?.factor_attribution?.cooccurrence || 0.10,
          positional: numeros[0]?.factor_attribution?.positional || 0.07,
          pattern: numeros[0]?.factor_attribution?.pattern || 0.05,
          trend: 0.05,
        },
        v7_engine: hasV7 ? {
          ensemble_size: v7Result?.ensembleSize || 0,
          v6_weight: engineW.V6,
          v7_weight: engineW.V7,
          ml_weight: engineW.ML,
          adaptive: !!v7Result?.adaptiveWeights,
          total_evaluations: v7Result?.adaptiveWeights?.totalEvaluations || 0,
        } : null,
        ml_engine: hasML ? {
          available: true,
          models: mlResult?.modelContributions || { randomForest: 0, neuralNet: 0, markov: 0 },
        } : null,
      },
      numeros,
      totalSorteos,
      fechasAnalizadas: totalSorteos,
      generado: new Date().toISOString(),
      confidence,
      pred: {
        numeros_2: pred2,
        numeros_3: pred3,
        numeros_4: pred4,
        redoblona,
      },
      redoblona,
      heatmap,
      stats,
      numeros_2: pred2,
      numeros_3: pred3.length > 0 ? pred3 : undefined,
      numeros_4: pred4.length > 0 ? pred4 : undefined,
      analysisInfo: {
        metodo: `Omega V6+V7+ML Hybrid: V6 SQL (9) + V7 TS (10) + ML (${hasML ? 'RF/NNet/Markov' : 'none'}) — ${turnoCanonical.toUpperCase()}`,
        motores: [
          `[V6 Adaptive] Frecuencia multi-ventana: 7/15/30/60/90/180/365/full días`,
          `[V6 Adaptive] Markov: transiciones primer orden por turno`,
          `[V6 Adaptive] Hot score: decaimiento exponencial reciente`,
          `[V6 Adaptive] Cold score: inverse recency penalty`,
          `[V6 Adaptive] Gap/Overdue: atraso estadístico normalizado`,
          `[V6 Adaptive] Co-ocurrencia: con top-3 frecuentes`,
          `[V6 Adaptive] Posicional: análisis por posición (1ra/2da/3ra)`,
          `[V6 Adaptive] Pattern penalty: suave, no exclusión`,
          `[V6 Adaptive] Trend: tendencia temporal`,
          ...(hasV7 ? [
            `[V7 Ensemble] Survival/Kaplan-Meier: números atrasados`,
            `[V7 Ensemble] Correlation: pares co-ocurrentes`,
            `[V7 Ensemble] Spacing: distribución de intervalos`,
            `[V7 Ensemble] Cycles: detección de ciclos`,
            `[V7 Ensemble] Temporal: patrones día/semana`,
            `[V7 Ensemble] Debt: números "vencidos"`,
            `[V7 Ensemble] Bayesian: posterior Dirichlet`,
            `[V7 Ensemble] Recency: decaimiento exponencial`,
            `[V7 Ensemble] Frequency: multi-ventana`,
            `[V7 Ensemble] Markov: transiciones`,
          ] : []),
        ],
        datosUtilizados: `${totalSorteos} sorteos — V6 SQL + ${hasV7 ? 'V7 TypeScript ensemble' : 'sin V7'}`,
        confianzaAvanzada: {
          promedioGeneral: confidence,
          enCicloFavorable: pred2.slice(0, 5),
          evitar: [],
          factor_attribution: numeros[0]?.factor_attribution || null,
          backtest_top10_rate: confidence,
        }
      }
    }

    // ── 10. Save engine prediction (closed loop) ────────────────
    // Fire-and-forget: save to engine_predictions for later evaluation
    try {
      const pred2Int = pred2.map(n => parseInt(n, 10))
      const pred3Int = pred3.length > 0 ? pred3.map(n => parseInt(n, 10)) : null
      const pred4Int = pred4.length > 0 ? pred4.map(n => parseInt(n, 10)) : null
      const redoblonaObj = redoblona ? (() => {
        const [c, a] = redoblona.split('-')
        return { cabeza: c, acompanante: a }
      })() : null

      const todayDate = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })

      supabaseAdmin.rpc('save_engine_prediction' as never, {
        p_engine_version: 'meta-ensemble-v1',
        p_turno: turnoCanonical,
        p_prediction_date: todayDate,
        p_historical_cutoff: todayDate,
        p_draws_used: totalSorteos,
        p_pred_2c: pred2Int,
        p_pred_3c: pred3Int,
        p_pred_4c: pred4Int,
        p_pred_redoblona: redoblonaObj,
        p_scores_2c: numeros.map(n => ({ n: n.n, score: n.score, rank: n.rank })),
        p_weights_used: responsePayload.debug.dynamic_weights,
        p_confidence: confidence,
        p_factor_attribution: numeros[0]?.factor_attribution || null,
      } as never)
    } catch (e) {
      // Non-critical: don't break the prediction response
      logger.warn("[predictions] failed to save engine prediction:", { error: String(e) })
    }

    return NextResponse.json(responsePayload, {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
        "Vary": "Authorization",
        "X-Prediction-Turno": turnoCanonical,
        "X-Prediction-Date": todayBsAs,
        "X-Engine": hasV7 ? "omega-v6+v7-hybrid" : "omega-v6-adaptive",
        "X-Engine-Elapsed": elapsed.toString(),
        "X-Cache": "MISS",
        "X-Last-Draw-Id": lastDrawId.toString(),
        "X-Context-Seed": ctxSeed.toString(),
      },
    })

  } catch (err) {
    logger.error("[predictions] UNHANDLED ERROR:", { error: String(err) })
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// POST handler for auto-pilot (internal cron calls, requires Bearer auth)
export async function POST(req: NextRequest) {
  try {
    // Auth check: only internal cron calls allowed
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

    // Build pred2 from RPC rows
    const sorted = rows
      .filter((r) => r.puntaje_total)
      .sort((a, b) => (b.puntaje_total || 0) - (a.puntaje_total || 0))

    const numeros_2 = sorted.slice(0, 10).map((r) => String(r.numero).padStart(2, "0"))

    // Extract 3/4 cifras from RPC (only available with p_tier='premium')
    let numeros_3: string[] = []
    let numeros_4: string[] = []
    let redoblona: { cabeza: string; acompanante: string } | null = null

    if (include3And4) {
      // Get 3 cifras from first row that has them
      for (const r of rows) {
        if (r.prediccion_3cifras && Array.isArray(r.prediccion_3cifras) && r.prediccion_3cifras.length > 0) {
          numeros_3 = r.prediccion_3cifras.map((n: string) => n.padStart(3, "0"))
          break
        }
      }
      // Get 4 cifras from first row that has them
      for (const r of rows) {
        if (r.prediccion_4cifras && Array.isArray(r.prediccion_4cifras) && r.prediccion_4cifras.length > 0) {
          numeros_4 = r.prediccion_4cifras.map((n: string) => n.padStart(4, "0"))
          break
        }
      }
      // Get redoblona from first row that has it
      for (const r of rows) {
        if (r.redoblona && typeof r.redoblona === "object" && r.redoblona.cabeza) {
          redoblona = r.redoblona
          break
        }
      }
    }

    return NextResponse.json({
      pred: {
        numeros_2,
        numeros_3,
        numeros_4,
        redoblona,
        topNumeros: sorted.slice(0, 10).map((r, i) => ({
          numero: String(r.numero).padStart(2, "0"),
          score: r.puntaje_total || 0,
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
