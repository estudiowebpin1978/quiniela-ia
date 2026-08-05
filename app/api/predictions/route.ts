/**
 * API de predicciones de Quiniela IA — Engine Omega.
 *
 * Arquitectura: PostgreSQL RPCs pre-calculan el Top 10 en cada sorteo.
 * Esta API solo lee cached_predictions (SELECT < 50ms).
 * Free: solo 2 cifras | Premium: 3/4 cifras + redoblona.
 *
 * "La Verdad Absoluta": mismo turno = mismos números para todos.
 * Solo cambia cuando un nuevo sorteo entra en la DB.
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

// Map turno alias to canonical name
function normalizeTurno(t: string): string {
  const map: Record<string, string> = {
    previa: "Previa", primera: "Primera", matutina: "Matutina",
    vespertina: "Vespertina", nocturna: "Nocturna"
  }
  return map[t.toLowerCase()] || t
}

// ============================================
// MAIN API — Engine Omega (cached predictions)
// ============================================
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"

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
  const userTier = await resolveUserTier(token)

  if (token && !userTier.canAccess2Cifras) {
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

  // ── 1. Try cached_predictions first (instant < 50ms) ───────
  const todayArgentina = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })

  let { data: cached, error: cacheError } = await supabaseAdmin
    .from("cached_predictions")
    .select("numeros, redoblona, total_sorteos_analizados, calculated_at")
    .eq("turno", turnoCanonical)
    .eq("prediction_date", todayArgentina)
    .maybeSingle()

  // ── 2. If no cache for today, fire background refresh (non-blocking) ──
  if (!cached || cacheError) {
    // Fire and forget — don't await, return 503 immediately
    supabaseAdmin.rpc('refresh_cached_predictions', { turno_objetivo: turnoCanonical }).catch(() => {})

    return NextResponse.json({
      error: `Sin datos缓存ados para turno ${turnoQuery}. Refrescando... intentá de nuevo en 3 segundos.`,
      refreshing: true, turno: turnoQuery,
    }, { status: 503 })
  }

  // ── 3. Parse RPC results (12-factor engine) ─────────────────
  interface RPCRow {
    numero: number
    puntaje_total: number
    f_calor: number
    f_demora: number
    f_afinidad: number
    f_markov: number
    f_bayesian: number
    f_entropy: number
    f_survival: number
    f_cyclic: number
    f_drift: number
    f_correlation: number
    f_seasonal: number
    f_montecarlo: number
    // Legacy field names from old engine
    desglose_calor?: number
    desglose_demora?: number
    desglose_turno?: number
    desglose_markov?: number
  }

  const rpcRows: RPCRow[] = Array.isArray(cached.numeros) ? cached.numeros : []
  const totalSorteos = cached.total_sorteos_analizados || 0

  // ── 4. Build pred2 (2 cifras) from RPC results ──────────────
  const pred2 = rpcRows.slice(0, 10).map((r: RPCRow) => pad(r.numero))

  // ── 5. Build numeros (TopNumero[]) with suenos + 12 factors ─
  const numeros: TopNumero[] = rpcRows.slice(0, 10).map((r: RPCRow, i: number) => ({
    n: r.numero,
    numero: pad(r.numero),
    emoji: SUENOS[r.numero]?.emoji || "❓",
    significado: SUENOS[r.numero]?.nombre || "",
    score: r.puntaje_total / 100,
    confianza: Math.min(95, Math.round(50 + r.puntaje_total * 0.45)),
    rank: i + 1,
    frecuencia: Math.round(r.f_calor || r.desglose_calor || 0),
    factores: [
      `Calor: ${(r.f_calor || r.desglose_calor || 0).toFixed(1)}%`,
      `Demora: ${(r.f_demora || r.desglose_demora || 0).toFixed(1)}%`,
      `Afinidad: ${(r.f_afinidad || r.desglose_turno || 0).toFixed(1)}%`,
      `Markov: ${(r.f_markov || r.desglose_markov || 0).toFixed(1)}%`,
      `Bayesian: ${(r.f_bayesian || 0).toFixed(1)}%`,
      `Entropía: ${(r.f_entropy || 0).toFixed(1)}%`,
      `Supervivencia: ${(r.f_survival || 0).toFixed(1)}%`,
      `Cíclico: ${(r.f_cyclic || 0).toFixed(1)}%`,
      `Drift: ${(r.f_drift || 0).toFixed(1)}%`,
      `Correlación: ${(r.f_correlation || 0).toFixed(1)}%`,
      `Estacional: ${(r.f_seasonal || 0).toFixed(1)}%`,
      `MonteCarlo: ${(r.f_montecarlo || 0).toFixed(1)}%`,
    ],
  }))

  // ── 6. Confidence from average of top 10 ────────────────────
  const confidence = rpcRows.length > 0
    ? Math.round(rpcRows.slice(0, 10).reduce((sum: number, r: RPCRow) => sum + r.puntaje_total, 0) / Math.min(10, rpcRows.length))
    : 50

  // ── 7. Redoblona (premium only) ─────────────────────────────
  let redoblona: string | null = null
  let pred3: string[] = []
  let pred4: string[] = []

  if (userTier.canAccessPremiumFeatures) {
    // Redoblona from cached RPC result
    if (cached.redoblona && typeof cached.redoblona === 'object') {
      const cabeza = (cached.redoblona as Record<string, unknown>).cabeza as number | undefined
      const acompanantes = (cached.redoblona as Record<string, unknown>).acompanantes as Array<{ numero_acompanante: number }> | undefined
      if (cabeza !== undefined && acompanantes && acompanantes.length > 0) {
        redoblona = `${pad(cabeza)}-${pad(acompanantes[0].numero_acompanante)}`
      }
    }

    // 3/4 cifras via lightweight SQL (premium only, no heavy TS motor)
    try {
      // 3 cifras: query last 150 draws for this turno, count all 3-digit sequences
      const { data: rawRows } = await supabaseAdmin
        .from("draws")
        .select("numbers")
        .ilike("turno", `%${turnoCanonical}%`)
        .order("date", { ascending: false })
        .limit(150)

      if (rawRows && rawRows.length > 0) {
        // Count 3-digit frequencies: "019" means draws containing 01 then 19 adjacent
        const freq3 = new Map<string, number>()
        const freq4 = new Map<string, number>()

        for (const row of rawRows) {
          if (!Array.isArray(row.numbers) || row.numbers.length < 5) continue
          const nums = row.numbers.map((n: number) => pad(n))

          // 3 cifras: first 3 digits of each number (pad leading zero)
          for (const n of nums) {
            const key3 = n.substring(0, 3)
            freq3.set(key3, (freq3.get(key3) || 0) + 1)
          }

          // 4 cifras: pairs of adjacent numbers
          for (let i = 0; i < nums.length - 1; i++) {
            const key4 = nums[i].substring(0, 2) + nums[i + 1].substring(0, 2)
            freq4.set(key4, (freq4.get(key4) || 0) + 1)
          }
        }

        pred3 = [...freq3.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([num]) => num)

        pred4 = [...freq4.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([num]) => num)
      }
    } catch {}
  }

  // ── 8. Heatmap ──────────────────────────────────────────────
  const heatmap: HeatmapItem[] = rpcRows.slice(0, 10).map((r: RPCRow) => ({
    n: r.numero,
    f: Math.round(r.f_calor || r.desglose_calor || 0),
    s: SUENOS[r.numero] || { emoji: "❓", nombre: "" },
    pct: r.f_calor || r.desglose_calor || 0,
  }))

  // ── 9. Stats ────────────────────────────────────────────────
  const stats = {
    totalNumeros: totalSorteos,
    promedioPorSorteo: totalSorteos > 0 ? "20.00" : "0",
    numeroMasFrecuente: numeros.length > 0
      ? { numero: numeros[0].numero, frecuencia: numeros[0].frecuencia, significado: numeros[0].significado }
      : { numero: "00", frecuencia: 0, significado: "" },
    terminacionesMasFrecuentes: rpcRows.slice(0, 5).map((r: RPCRow) => ({
      terminacion: r.numero,
      frecuencia: Math.round(r.f_calor || r.desglose_calor || 0),
      score: r.puntaje_total.toFixed(2),
    })),
  }

  // ── 10. AI Summary (best effort, 2s timeout) ────────────────
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

  // ── 11. Build response ──────────────────────────────────────
  const responsePayload: PredictionResponse = {
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
      elapsed_ms: Date.now() - t0,
      factores_aplicados: 4,
      motores_activos: 1,
      total_numeros: totalSorteos * 20,
      determinista: true,
      sorteos_analizados: totalSorteos,
      sync: null,
      cdm_model: { activo: false, topNumeros: [] },
      advanced_analytics: {
        entropy: null, survival: null, interTurno: null,
        genetic: null, cachedAnalytics: null,
      }
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
    analysisInfo: {
      metodo: `Engine Omega v3: 12-Factor Ensemble — ${turnoCanonical.toUpperCase()}`,
      motores: [
        "1. Calor: frecuencia en últimos 100 sorteos (12%)",
        "2. Demora: atraso desde última aparición (14%)",
        "3. Afinidad: frecuencia histórica del turno (8%)",
        "4. Markov: transiciones desde último número (10%)",
        "5. Bayesian: posterior Dirichlet-Multinomial (10%)",
        "6. Entropía Shannon: predecibilidad del turno (8%)",
        "7. Supervivencia: Kaplan-Meier overdue detection (10%)",
        "8. Cíclico: periodicidad DFT (6%)",
        "9. Drift: detección de cambio chi-cuadrado (8%)",
        "10. Correlación: co-ocurrencia de pares (6%)",
        "11. Estacional: patrones temporales (4%)",
        "12. MonteCarlo: scoring con decaimiento exponencial (4%)",
      ],
      datosUtilizados: `${totalSorteos} sorteos analizados en PostgreSQL`,
      confianzaAvanzada: {
        promedioGeneral: confidence,
        enCicloFavorable: pred2.slice(0, 5),
        evitar: [],
      }
    }
  }

  return NextResponse.json(responsePayload)
}
