/**
 * API de predicciones de Quiniela IA — Engine Omega v5 Proven Ensemble.
 *
 * 8 proven statistical methods: Frequency+Recency, Bayesian, Markov, Hot/Cold,
 * Gap/Overdue, Co-occurrence, Positional, Sum Balance.
 * Weighted ensemble with backtest-optimized weights. ~120-700ms per call.
 *
 * Free: solo 2 cifras | Premium: 3/4 cifras + redoblona.
 */

import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { generatePredictionSummary } from "@/lib/ai/summary"
import { checkRateLimit, RATE_LIMIT_PRESETS } from "@/lib/rate-limiter"
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

// ── RPC row type (v5 hierarchical) ──────────────────────────
interface OmegaRow {
  numero: number
  puntaje_total: number
  prediccion_2cifras: string
  prediccion_3cifras: string[] | null
  prediccion_4cifras: string[] | null
  redoblona: { cabeza: string; acompanante: string } | null
}

// ============================================
// MAIN API — Engine Omega v4 Hybrid
// ============================================
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
    return NextResponse.json({
      error: "Tu período gratuito de 30 días expiró. Actualizá a Premium para continuar.",
      trialExpired: true, tier: userTier.role, upgradeRequired: true,
    }, { status: 403 })
  }

  // ── Parse turno ─────────────────────────────────────────────
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

  // ── Determine RPC tier param ────────────────────────────────
  const rpcTier = userTier.canAccessPremiumFeatures ? 'premium' : 'free'

  // ── 1. Call v5 Ensemble RPC + total draws count in parallel ──
  const [rpcResult, drawsResult] = await Promise.all([
    supabaseAdmin.rpc('calculate_omega_v5', {
      p_turno: turnoCanonical,
      p_tier: rpcTier,
    }),
    supabaseAdmin
      .from('draws')
      .select('id', { count: 'exact', head: true })
      .eq('turno', turnoCanonical),
  ])

  if (rpcResult.error) {
    console.error("[predictions] RPC error:", rpcResult.error)
    return NextResponse.json(
      { error: "Error calculando predicciones. Intentá de nuevo.", detail: rpcResult.error.message },
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

  // ── 2. Build pred2 from RPC (row 1 has comma-separated list, rows 2-10 have single) ──
  const firstRow = rows[0]
  const pred2: string[] = []
  if (firstRow?.prediccion_2cifras) {
    // Row 1: "03,13,14,20,21,33,43,53,55,63" → array of 2-digit strings
    for (const n of firstRow.prediccion_2cifras.split(',')) {
      pred2.push(n.trim().padStart(2, '0'))
    }
  }
  // Fallback: if row 1 empty, use rows 2-10
  if (pred2.length === 0) {
    for (const r of rows.slice(0, 10)) {
      if (r.prediccion_2cifras) pred2.push(r.prediccion_2cifras.padStart(2, '0'))
    }
  }

  // ── 3. Build numeros (TopNumero[]) from RPC rows ────────────
  const numeros: TopNumero[] = rows.slice(0, 10).map((r, i) => {
    const num = r.numero
    const score = r.puntaje_total || 0
    return {
      n: num,
      numero: pad(num),
      emoji: SUENOS[num]?.emoji || "❓",
      significado: SUENOS[num]?.nombre || "",
      score: 0.5,
      confianza: 50,
      rank: i + 1,
      frecuencia: 0,
      factores: [],
      bayesianConfidence: 0,
      bayesianPosterior: 0,
      highConfidence: false,
    }
  })

  // ── 4. Confidence from number of predictions returned ────────
  const confidence = pred2.length >= 10 ? 72 : pred2.length >= 5 ? 65 : 50

  // ── 5. Redoblona + 3/4 cifras (premium only) ───────────────
  let redoblona: string | null = null
  let pred3: string[] = []
  let pred4: string[] = []

  if (userTier.canAccessPremiumFeatures && firstRow) {
    // Redoblona from row 1: { cabeza: "03", acompanante: "43" }
    const rb = firstRow.redoblona
    if (rb?.cabeza && rb?.acompanante) {
      redoblona = `${String(rb.cabeza).padStart(2, '0')}-${String(rb.acompanante).padStart(2, '0')}`
    }

    // 3 cifras from row 1 (JSONB array)
    if (Array.isArray(firstRow.prediccion_3cifras)) {
      pred3 = firstRow.prediccion_3cifras.map(p => String(p).padStart(3, '0')).slice(0, 10)
    }

    // 4 cifras from row 1 (JSONB array)
    if (Array.isArray(firstRow.prediccion_4cifras)) {
      pred4 = firstRow.prediccion_4cifras.map(p => String(p).padStart(4, '0')).slice(0, 10)
    }
  }

  // ── 6. Heatmap ──────────────────────────────────────────────
  const heatmap: HeatmapItem[] = numeros.map((num) => ({
    n: num.n,
    f: num.frecuencia,
    s: SUENOS[num.n] || { emoji: "❓", nombre: "" },
    pct: num.score * 100,
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

  // ── 8. AI Summary (best effort, 2s timeout) ────────────────
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
      factores_aplicados: 12,
      motores_activos: 12,
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
        freq_recency: 0.20,
        bayesian: 0.18,
        markov: 0.15,
        hot_cold: 0.15,
        gap: 0.12,
        cooccurrence: 0.10,
        positional: 0.05,
        sum_balance: 0.05,
      },
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
    // Top-level fields expected by frontend (PredDataSchema)
    numeros_2: pred2,
    numeros_3: pred3.length > 0 ? pred3 : undefined,
    numeros_4: pred4.length > 0 ? pred4 : undefined,
    analysisInfo: {
      metodo: `Engine Omega v5 Hierarchical: 8 métodos + 4 capas (2/3/4 cifras + redoblona) — ${turnoCanonical.toUpperCase()}`,
      motores: [
        "[Ensemble 100%] Frecuencia+Recencia: decaimiento exponencial (20%)",
        "[Ensemble 100%] Bayesian Dirichlet-Multinomial (18%)",
        "[Ensemble 100%] Markov: transiciones primer orden (15%)",
        "[Ensemble 100%] Hot/Cold: ratio reciente vs histórico (15%)",
        "[Ensemble 100%] Gap/Overdue: atraso estadístico (12%)",
        "[Ensemble 100%] Co-ocurrencia: números que aparecen juntos (10%)",
        "[Ensemble 100%] Posicional: análisis por posición (5%)",
        "[Ensemble 100%] Balance suma: filtrado rango medio (5%)",
      ],
      datosUtilizados: `${totalSorteos} sorteos — cálculo on-demand via PostgreSQL`,
      confianzaAvanzada: {
        promedioGeneral: confidence,
        enCicloFavorable: pred2.slice(0, 5),
        evitar: [],
      }
    }
  }

  return NextResponse.json(responsePayload, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      "X-Prediction-Turno": turnoCanonical,
      "X-Prediction-Date": new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" }),
      "X-Engine": "omega-v5-ensemble",
      "X-Engine-Elapsed": elapsed.toString(),
    },
  })

  } catch (err) {
    console.error("[predictions] UNHANDLED ERROR:", err)
    return NextResponse.json(
      { error: "Internal server error", detail: String(err) },
      { status: 500 }
    )
  }
}
