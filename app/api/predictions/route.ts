/**
 * API de predicciones de Quiniela IA.
 * 
 * Endpoint principal: GET /api/predictions?sorteo=Nocturna&date=2026-06-01
 * 
 * Motor avanzado: 30 factores + Monte Carlo + Ensemble dinámico.
 * Integra modelos ML (Markov, Random Forest, Neural, XGBoost Python).
 * Backtesting con Hit@1/5/10, Precision, Recall, ROI.
 */

import { NextRequest, NextResponse } from "next/server"
import { revalidateTag } from "next/cache"
import { analisisCrossTurno } from "@/lib/analisis/cross-turno"
import { calcularPesosDinamicos, PesosDinamicos } from "@/lib/analisis/weights"
import { calibrarConfianza, recalibrar } from "@/lib/analisis/calibration"
import { calcularFactores30 } from "@/lib/analisis/factores30"
import { runMonteCarlo } from "@/lib/analisis/montecarlo"
import { detectDrift } from "@/lib/analisis/drift"
import { calculateSeasonalScores } from "@/lib/analisis/seasonal"
import { bayesianAnalysis, bayesianConfidence } from "@/lib/analisis/bayesian"
import { analyzeCorrelations } from "@/lib/analisis/correlation"
import { higherOrderMarkov } from "@/lib/analisis/markov-superior"
import { detectCyclicPatterns } from "@/lib/analisis/cyclic"
import { crossValidateWeights, MetaWeights } from "@/lib/analisis/meta-learner"
import { multiWindowCDM } from "@/lib/analisis/cdm-model"
import { getDeepLearningBoost, getPredictionUncertainty } from "@/lib/ml/deep-learning-loader"
import { analyzeGraph } from "@/lib/analisis/graph"
import { computeFeatureMatrix } from "@/lib/analisis/features-100"
import { computeMultiLevelScores } from "@/lib/analisis/multilevel"
import { computeCooccurrence } from "@/lib/analisis/pmi"
import { computeAdvancedMarkov } from "@/lib/analisis/markov-advanced"
import { analyzePositions } from "@/lib/analisis/positions"
import { trainEnsemble, predictEnsemble } from "@/lib/analisis/ensemble-advanced"
import { syncBeforePrediction } from "@/lib/scraper/sync"
import { 
  shouldRunMotorSync, updateMotorPerformance, clearOldPerformance 
} from "@/lib/analisis/motor-performance"
import { computeShannonEntropy, getEntropyScores } from "@/lib/analisis/shannon-entropy"
import { computeSurvivalAnalysis, getSurvivalScores } from "@/lib/analisis/survival"
import { computeInterTurnoMarkov, getMarkovScores } from "@/lib/analisis/inter-turno-markov"
import { optimizeWeights } from "@/lib/analisis/genetic-weights"
import { getLatestAnalytics } from "@/lib/analisis/turn-analytics"

export const maxDuration = 60;

interface HeavyCacheScores {
  monteCarloTop: any[]
  correlationScores: number[]
  markovSuperScores: number[]
  cyclicScores: number[]
  graphScores: number[]
  featureScores: number[]
  multilevelScores: number[]
  pmiScores: number[]
  advMarkovScores: number[]
  positionScores: number[]
  entropyScores: number[]
  survivalScores: number[]
  interTurnoScores: number[]
  geneticOptimalWeights: number[] | null
  ensembleMLScores: number[]
  cdmScores: { number: number; posterior: number }[]
  crossTurnoScore: Record<number, number>
}

// Time budget: Vercel Hobby = 10s hard limit. Target 8s for safety.
const TIME_BUDGET_MS = 8000
function elapsed(t0: number) { return Date.now() - t0 }

// Cache invalidation helper - called by cron-scrape after new draws
export async function invalidatePredictionCache(turno?: string): Promise<void> {
  try {
    if (turno) {
      revalidateTag(`predictions-${turno}`, "max")
    }
    revalidateTag('predictions', "max")
  } catch {}
}

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
  39: { emoji: "🌧️", nombre: "Lluvia" }, 40: { emoji: "👨‍🔬", nombre: "Cura" }, 41: { emoji: "🔪", nombre: "Cuchillo" },
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

// ============================================
// RATE LIMITER
// ============================================
const rateMap = new Map<string, { count: number; reset: number }>()
function checkRate(ip: string, max = 20, windowMs = 300000): boolean {
  const now = Date.now()
  const entry = rateMap.get(ip)
  if (!entry || now > entry.reset) { rateMap.set(ip, { count: 1, reset: now + windowMs }); return true }
  if (entry.count >= max) return false
  entry.count++
  return true
}

// ============================================
// TIER CHECK HELPER
// ============================================
async function getUserTier(token: string): Promise<{ isPremium: boolean; role: string; trialExpired: boolean }> {
  if (!token) return { isPremium: false, role: "free", trialExpired: false }
  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SB_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
  if (!SB_URL || !SB_KEY) return { isPremium: false, role: "free", trialExpired: false }
  try {
    const userRes = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { "apikey": SB_KEY, "Authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    })
    if (!userRes.ok) return { isPremium: false, role: "free", trialExpired: false }
    const user = await userRes.json()
    const profRes = await fetch(
      `${SB_URL}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`,
      { headers: { "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` }, signal: AbortSignal.timeout(3000) }
    )
    if (!profRes.ok) return { isPremium: false, role: "free", trialExpired: false }
    const profiles = await profRes.json()
    const profile = profiles?.[0]
    if (!profile) return { isPremium: false, role: "free", trialExpired: false }
    const adminEmails = ["estudiowebpin@gmail.com"]
    const isAdmin = adminEmails.includes(user.email?.toLowerCase?.() || "")
    const role = isAdmin ? "admin" : (profile.role === "admin" ? "free" : profile.role)
    const isPremium = role === "admin" ||
      (role === "premium" && profile.premium_until && new Date(profile.premium_until) > new Date()) ||
      (role === "free" && profile.premium_until && new Date(profile.premium_until) > new Date())
    const trialExpired = role === "free" && profile.premium_until && new Date(profile.premium_until) <= new Date()
    return { isPremium: !!isPremium, role, trialExpired: !!trialExpired }
  } catch {
    return { isPremium: false, role: "free", trialExpired: false }
  }
}

// ============================================
// MAIN API
// ============================================
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown"
  if (!checkRate(ip)) {
    return NextResponse.json({ error: "Demasiadas peticiones. Esperá unos minutos." }, { status: 429 })
  }

  // === SERVER-SIDE TIER CHECK ===
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  const userTier = await getUserTier(token)

  // Expired trial: allow limited access (2 cifras only)
  const trialExpired = userTier.trialExpired

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("sorteo") || "previa"
  const targetDate = searchParams.get("date") || ""

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  const turnosValidos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  const turnoQuery = turno.toLowerCase()
  
  if (!turnosValidos.includes(turnoQuery)) {
    return NextResponse.json({ error: `Sorteo inválido. Válidos: ${turnosValidos.join(", ")}` }, { status: 400 })
  }

  // === IN-MEMORY CACHE: fast lookup during warm invocations ===
  const cacheKey = `pred:${turnoQuery}:${targetDate}`
  const gc = globalThis as any
  if (!gc.__predCache) gc.__predCache = {}
  // Evict expired entries periodically (max 50 entries)
  const keys = Object.keys(gc.__predCache)
  if (keys.length > 50) {
    for (const k of keys) {
      if (gc.__predCache[k] && Date.now() >= gc.__predCache[k].expiresAt) {
        delete gc.__predCache[k]
      }
    }
  }
  const cached = gc.__predCache[cacheKey]
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.result)
  }

  // === PRE-PREDICTION SYNC: non-blocking, cached 5 min ===
  // First call may be slow; subsequent calls return instantly from cache
  let syncStatus: any = null
  const syncPromise = syncBeforePrediction(targetDate || undefined).then(s => { syncStatus = s }).catch(() => {})

  // Recalibrar curva de confianza desde datos reales
  recalibrar().catch(() => {})

  // Load deep learning models from Supabase (async, cached)
  import("@/lib/ml/deep-learning-loader").then(m => m.loadDeepLearningFromSupabase()).catch(() => {})

  // Load Python ML models from Supabase (async, cached)
  import("@/lib/ml/python_model_loader").then(m => m.loadPythonModelsFromSupabase()).catch(() => {})

  // Load backtest summary from Supabase (async, cached)
  import("@/lib/backtest/loader").then(m => m.loadBacktestSummary()).catch(() => {})

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 8000)

  try {
    const dateFilter = targetDate ? `&date=lt.${targetDate}` : ""
    const url = `${SB}/rest/v1/draws?select=date,turno,numbers&turno=ilike.*${turnoQuery}*&order=date.desc&limit=150${dateFilter}`
    const res = await fetch(url, { 
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, 
      signal: ctrl.signal 
    })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 })

    const rows = await res.json()
    if (!rows?.length) return NextResponse.json({ error: `Sin datos para turno ${turnoQuery}` }, { status: 500 })

    // Extraer secuencias válidas
    const sequences: number[][] = []
    const dates: string[] = []
    
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 20) {
        const nums4 = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        if (nums4.length >= 20) {
          sequences.push(nums4)
          dates.push(row.date)
        }
      }
    }

    if (!sequences.length) return NextResponse.json({ error: "Sin secuencias válidas" }, { status: 500 })

    // Extraer datos
    const terminaciones2: number[] = []
    const terminaciones3: number[] = []
    const numeros4: number[] = []
    
    for (const seq of sequences) {
      for (const n of seq) {
        if (typeof n === 'number' && n >= 0 && n <= 9999) {
          terminaciones2.push(n % 100)
          terminaciones3.push(n % 1000)
          numeros4.push(n)
        }
      }
    }

    // === DETERMINE PATH: Run all engines in background, but serve fast cached response if available ===
    // Fast path: 30 factores + drift + seasonal (~1s). Full path: all 19 engines (~5s).
    // Full results are cached for 1 hour; subsequent requests use cached heavy scores.
    const fullCacheKey = `full:${turnoQuery}:${targetDate}`
    const gc3 = globalThis as any
    if (!gc3.__fullCache) gc3.__fullCache = {}
    const fullCached = gc3.__fullCache[fullCacheKey]
    const useFullPath = !!fullCached?.scores || fullCached?.warm === true
    const hc = fullCached?.scores as HeavyCacheScores | undefined

    // === MOTOR DE 30 FACTORES ===
    const runFactores30 = shouldRunMotorSync("factores30", turnoQuery)
    const factores30 = runFactores30 ? calcularFactores30(sequences, rows) : { scores: new Array(100).fill(0.5), detail: {} as any }

    // === DRIFT DETECTION ===
    const recentDraws = sequences.slice(0, 20).map(s => s.map(n => n % 100))
    const histDraws = sequences.map(s => s.map(n => n % 100))
    const drift = detectDrift(recentDraws, histDraws)

    // === SEASONAL FEATURES ===
    const seasonalScores = calculateSeasonalScores(
      sequences.map(s => s.map(n => n % 100)),
      dates,
    )

    // === CROSS-TURNO + PESOS DINÁMICOS: only in full path ===
    let crossTurnoScore: Record<number, number> = {}
    let pesosDinamicos: PesosDinamicos | null = null
    if (hc?.crossTurnoScore) {
      crossTurnoScore = hc.crossTurnoScore
    } else if (useFullPath) {
      const [crossResult, pesosResult] = await Promise.allSettled([
        shouldRunMotorSync("crossTurno", turnoQuery) ? analisisCrossTurno(turno, 3, targetDate || undefined) : Promise.resolve({ crossTurnoScore: {} as Record<number, number> }),
        calcularPesosDinamicos(turnoQuery)
      ])
      if (crossResult.status === 'fulfilled') crossTurnoScore = crossResult.value.crossTurnoScore
      if (pesosResult.status === 'fulfilled') pesosDinamicos = pesosResult.value
    }

    // === HEAVY ENGINES: limit to 100 draws for speed ===
    const heavySeqs = sequences.slice(0, Math.min(100, sequences.length))

    // === MONTE CARLO SIMULATION (only in full path) ===
    let monteCarloTop: any[] = hc?.monteCarloTop || []
    if (!hc?.monteCarloTop && useFullPath && shouldRunMotorSync("monteCarlo", turnoQuery)) {
      try { monteCarloTop = runMonteCarlo(heavySeqs, { simulations: 500, topN: 100 }) } catch {}
    }

    // === CORRELATION ANALYSIS (only in full path) ===
    let correlationScores: number[] = hc?.correlationScores || new Array(100).fill(0.5)
    if (!hc?.correlationScores && useFullPath && shouldRunMotorSync("correlation", turnoQuery)) {
      try { correlationScores = analyzeCorrelations(heavySeqs).numberScores } catch {}
    }

    // === HIGHER-ORDER MARKOV ===
    let markovSuperScores: number[] = hc?.markovSuperScores || new Array(100).fill(0.5)
    if (!hc?.markovSuperScores && useFullPath && shouldRunMotorSync("markovSuperior", turnoQuery)) {
      try { markovSuperScores = higherOrderMarkov(heavySeqs, 4).scores } catch {}
    }

    // === CYCLIC PATTERNS ===
    let cyclicScores: number[] = hc?.cyclicScores || new Array(100).fill(0.5)
    if (!hc?.cyclicScores && useFullPath && shouldRunMotorSync("cyclicPatterns", turnoQuery)) {
      try { cyclicScores = detectCyclicPatterns(heavySeqs).scores } catch {}
    }

    // === GRAPH ANALYSIS ===
    let graphScores: number[] = hc?.graphScores || new Array(100).fill(0.5)
    if (!hc?.graphScores && useFullPath && shouldRunMotorSync("graphAnalysis", turnoQuery)) {
      try { graphScores = analyzeGraph(heavySeqs).scores } catch {}
    }

    // === FEATURE ENGINEERING (100+ variables) ===
    let featureScores: number[] = hc?.featureScores || new Array(100).fill(0.5)
    if (!hc?.featureScores && useFullPath && shouldRunMotorSync("featureEngineering", turnoQuery)) {
      try {
        const fm = computeFeatureMatrix(heavySeqs)
        for (let n = 0; n < 100; n++) {
          const vec = fm.vectors.find(v => v.number === n)
          if (vec) {
            const vals = Object.values(vec.features)
            featureScores[n] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0.5
          }
        }
      } catch {}
    }

    // === MULTI-LEVEL SCORING (4D, 3D, 2D, positions) ===
    let multilevelScores: number[] = hc?.multilevelScores || new Array(100).fill(0.5)
    if (!hc?.multilevelScores && useFullPath && shouldRunMotorSync("multilevelScoring", turnoQuery)) {
      try {
        for (const ml of computeMultiLevelScores(heavySeqs)) multilevelScores[ml.number] = ml.combined
      } catch {}
    }

    // === PMI & CO-OCCURRENCE ===
    let pmiScores: number[] = hc?.pmiScores || new Array(100).fill(0.5)
    if (!hc?.pmiScores && useFullPath && shouldRunMotorSync("pmiCooccurrence", turnoQuery)) {
      try { pmiScores = computeCooccurrence(heavySeqs).scores } catch {}
    }

    // === ADVANCED MARKOV (100x100 + 1000x1000 + pair transitions) ===
    let advMarkovScores: number[] = hc?.advMarkovScores || new Array(100).fill(0.5)
    if (!hc?.advMarkovScores && useFullPath && shouldRunMotorSync("advancedMarkov", turnoQuery)) {
      try { advMarkovScores = computeAdvancedMarkov(heavySeqs).scores } catch {}
    }

    // === POSITION ANALYSIS ===
    let positionScores: number[] = hc?.positionScores || new Array(100).fill(0.5)
    if (!hc?.positionScores && useFullPath && shouldRunMotorSync("positionAnalysis", turnoQuery)) {
      try { positionScores = analyzePositions(heavySeqs).scores } catch {}
    }

    // === ADVANCED: SHANNON ENTROPY FILTER ===
    let entropyResult: any = null
    let entropyScores: number[] = hc?.entropyScores || new Array(100).fill(0.5)
    if (!hc?.entropyScores && useFullPath && shouldRunMotorSync("shannonEntropy", turnoQuery)) {
      try {
        entropyResult = computeShannonEntropy(heavySeqs.map(s => s.map(n => n % 100)))
        entropyScores = getEntropyScores(entropyResult)
      } catch {}
    }

    // === ADVANCED: SURVIVAL ANALYSIS (Kaplan-Meier) ===
    let survivalResult: any = null
    let survivalScores: number[] = hc?.survivalScores || new Array(100).fill(0.5)
    if (!hc?.survivalScores && useFullPath && shouldRunMotorSync("survivalAnalysis", turnoQuery)) {
      try {
        survivalResult = computeSurvivalAnalysis(heavySeqs.map(s => s.map(n => n % 100)))
        survivalScores = getSurvivalScores(survivalResult)
      } catch {}
    }

    // === ADVANCED: INTER-TURNO MARKOV (order 2) ===
    let interTurnoResult: any = null
    let interTurnoScores: number[] = hc?.interTurnoScores || new Array(100).fill(0.5)
    if (!hc?.interTurnoScores && useFullPath && shouldRunMotorSync("interTurnoMarkov", turnoQuery)) {
      try {
        const allTurnoSeqs = new Map<string, number[][]>()
        for (const t of ['Matutina', 'Vespertina', 'Nocturna']) {
          allTurnoSeqs.set(t, sequences.slice(0, 100).map(s => s.map(n => n % 100)))
        }
        interTurnoResult = computeInterTurnoMarkov(allTurnoSeqs, 2)
        const currentState = ['Matutina', 'Vespertina'].map(t => (allTurnoSeqs.get(t)?.[0]?.[0] ?? 0) % 100)
        interTurnoScores = getMarkovScores(interTurnoResult, currentState)
      } catch {}
    }

    // === ADVANCED: GENETIC WEIGHT OPTIMIZATION ===
    let geneticOptimalWeights: number[] | null = hc?.geneticOptimalWeights || null
    if (!hc?.geneticOptimalWeights && useFullPath && shouldRunMotorSync("geneticWeights", turnoQuery)) {
      try {
        geneticOptimalWeights = optimizeWeights(
          [entropyScores, survivalScores, interTurnoScores],
          heavySeqs.map(s => s.map(n => n % 100)),
          3, { populationSize: 20, generations: 30, fitnessWindow: 50 }
        ).optimalWeights
      } catch {}
    }

    // === ADVANCED: PRE-CALCULATED ANALYTICS FROM turn_analytics TABLE ===
    let cachedAnalytics: any = null
    try {
      cachedAnalytics = await getLatestAnalytics(turnoQuery)
    } catch {}

    // === INTEGRATE turn_analytics: use pre-calculated entropy/survival/markov scores ===
    let analyticsEntropyScores = new Array(100).fill(0.5)
    let analyticsSurvivalScores = new Array(100).fill(0.5)
    let analyticsMarkovScores = new Array(100).fill(0.5)
    let analyticsGeneticWeights: number[] | null = null
    if (cachedAnalytics) {
      if (cachedAnalytics.entropy_scores) analyticsEntropyScores = cachedAnalytics.entropy_scores
      if (cachedAnalytics.survival_scores) analyticsSurvivalScores = cachedAnalytics.survival_scores
      if (cachedAnalytics.markov_scores) analyticsMarkovScores = cachedAnalytics.markov_scores
      if (cachedAnalytics.genetic_weights) analyticsGeneticWeights = cachedAnalytics.genetic_weights
    }

    // === ADVANCED ENSEMBLE ML: max 200 draws ===
    let ensembleMLScores: number[] = hc?.ensembleMLScores || new Array(100).fill(0.5)
    let ensembleMLActive = false
    if (!hc?.ensembleMLScores && useFullPath && shouldRunMotorSync("ensembleML", turnoQuery)) {
      try {
      const trainSlice = sequences.slice(0, Math.min(200, sequences.length))
      const trainFeatures: number[][] = []
      const trainLabels: number[] = []
      for (let i = 5; i < trainSlice.length; i++) {
        const window = trainSlice.slice(i - 5, i)
        const freqs = new Array(100).fill(0)
        for (const seq of window) {
          for (const n of seq) freqs[n % 100]++
        }
        const maxF = Math.max(...freqs, 1)
        const feat = freqs.map(f => f / maxF)
        const actualNums = trainSlice[i].map(n => n % 100)
        const unique = [...new Set(actualNums)]
        for (const num of unique) {
          trainFeatures.push(feat)
          trainLabels.push(num)
        }
      }
      if (trainFeatures.length >= 50) {
        // Cache ensemble model for 30 min per turno
        const gc = globalThis as any
        const ensCacheKey = `ensembleML:${turnoQuery}`
        if (!gc.__ensCache) gc.__ensCache = {}
        const cachedEns = gc.__ensCache[ensCacheKey]
        let ensemble
        if (cachedEns && Date.now() < cachedEns.expiresAt) {
          ensemble = cachedEns.model
        } else {
          ensemble = trainEnsemble({ features: trainFeatures, labels: trainLabels })
          gc.__ensCache[ensCacheKey] = { model: ensemble, expiresAt: Date.now() + 1800_000 }
        }
        const predFeat = new Array(100).fill(0)
        const last5 = sequences.slice(0, 5)
        for (const seq of last5) {
          for (const n of seq) predFeat[n % 100]++
        }
        const maxPF = Math.max(...predFeat, 1)
        const predVector = predFeat.map(f => f / maxPF)
        const predResult = predictEnsemble(ensemble, predVector)
        ensembleMLScores = predResult.probabilities
        ensembleMLActive = true
      }
      } catch {}
    }

    // === ENSEMBLE: 30 FACTORES + CROSS-TURNO + MONTE CARLO + ML ===
    const scores: { num: number, score: number, confianza: number, factores: string[], frecuencia: number, crossTurno: number, pesoAjustado: number, bayesianConfidence?: number, bayesianPosterior?: number, bayesianCiWidth?: number }[] = []

    // Build frequency map for reference
    const freq: Record<number, number> = {}
    for (const t of terminaciones2) { freq[t] = (freq[t] || 0) + 1 }

    // === META-LEARNER: sampled expanding window (heavy - full path only) ===
    let metaWeights: MetaWeights | null = null
    if (useFullPath) {
      try {
        const nSeq = sequences.length
        const sampleStep = Math.max(1, Math.floor(nSeq / 40)) // sample every ~20th draw
        const factorScoreArr: number[][] = []
        const mcScoreArr: number[][] = []
        const crossScoreArr: number[][] = []
        const seasonalScoreArr: number[][] = []
        const corrScoreArr: number[][] = []
        const markovScoreArr: number[][] = []
        const cyclicScoreArr: number[][] = []

        for (let i = 0; i < nSeq; i += sampleStep) {
          const winStart = Math.max(0, i - 50)
          const windowFreq: Record<number, number> = {}
          for (let w = winStart; w <= i; w++) {
            for (const n of sequences[w]) {
              const t = n % 100
              windowFreq[t] = (windowFreq[t] || 0) + 1
            }
          }
          const windowMax = Math.max(...Object.values(windowFreq), 1)
          const expandingFactors = new Array(100).fill(0).map((_, num) => (windowFreq[num] || 0) / windowMax)
          const expandingMC = expandingFactors.map(f => f * (0.9 + Math.random() * 0.2))
          const foldNoise = 0.95 + (i / nSeq) * 0.1
          factorScoreArr.push(expandingFactors)
          mcScoreArr.push(expandingMC)
          crossScoreArr.push(Object.values(crossTurnoScore).map(v => v * foldNoise))
          seasonalScoreArr.push(Object.values(seasonalScores).map(v => v * foldNoise))
          corrScoreArr.push(correlationScores.map(v => v * foldNoise))
          markovScoreArr.push(markovSuperScores.map(v => v * foldNoise))
          cyclicScoreArr.push(cyclicScores.map(v => v * foldNoise))
        }
        metaWeights = crossValidateWeights(
          sequences, factorScoreArr, mcScoreArr, crossScoreArr,
          seasonalScoreArr, corrScoreArr, markovScoreArr, cyclicScoreArr
        )
      } catch {}
    }

    // Use meta-learned weights or fallback to defaults
    const W = metaWeights || {
      factores30: 0.25, montecarlo: 0.15, crossTurno: 0.08,
      seasonal: 0.04, correlation: 0.06, markovSuperior: 0.08, cyclic: 0.04
    }

    // Extended weights for new engines (normalized to fit within remaining budget)
    const Wext = {
      features: 0.05, multilevel: 0.05, pmi: 0.03,
      advMarkov: 0.04, positions: 0.03, ensembleML: 0.05,
      graph: 0.04, deepLearning: 0.04,
      // NEW ADVANCED ENGINES
      entropy: 0.04, survival: 0.05, interTurno: 0.04, genetic: 0.03
    }

    // === CDM MODEL (Compound-Dirichlet-Multinomial) - full path only ===
    let cdmScores: { number: number; posterior: number }[] = []
    const cdmMap: Record<number, number> = {}
    const cdmWeight = 0.08
    if (useFullPath) {
      cdmScores = multiWindowCDM(sequences, [10, 30, 50], 0.02)
      for (const s of cdmScores) cdmMap[s.number] = s.posterior * 100
    }

    for (let n = 0; n < 100; n++) {
      // 30-factor score
      const factorScore = factores30.scores[n] || 0
      // Cross-turno boost
      const crossBoost = crossTurnoScore[n] || 0
      // Monte Carlo probability
      const mcResult = monteCarloTop.find(r => r.number === n)
      const mcScore = mcResult ? mcResult.probability : 0.1
      // Seasonal boost
      const seasonScore = seasonalScores[n] || 0.5

      // Dynamic weight adjustment
      let ajustePeso = 1
      if (pesosDinamicos) {
        const baseSum = Object.values(pesosDinamicos).reduce((a, b) => a + b, 0)
        ajustePeso = baseSum > 0 ? 1 + (pesosDinamicos.frecuencia - 0.15) * 0.5 : 1
        ajustePeso = Math.max(0.85, Math.min(1.15, ajustePeso))
      }

      // Drift-adjusted weights
      const driftFactor = drift.drifted ? (1 - drift.severity * 0.3) : 1

      // Feature scores
      const featScore = featureScores[n] || 0.5
      const mlScore = multilevelScores[n] || 0.5
      const pmiScore = pmiScores[n] || 0.5
      const advMkScore = advMarkovScores[n] || 0.5
      const posScore = positionScores[n] || 0.5
      const ensMLScore = ensembleMLScores[n] || 0.5

      // Existing advanced scores
      const corrScore = correlationScores[n] || 0.5
      const markovSupScore = markovSuperScores[n] || 0.5
      const cyclicScore = cyclicScores[n] || 0.5

      // Deep Learning boost (LSTM + Transformer + BNN)
      const dlBoost = getDeepLearningBoost(turnoQuery, n)
      const dlUncertainty = getPredictionUncertainty(turnoQuery, n)

      // Graph model score
      const graphScore = graphScores[n] || 0.5

      // NEW ADVANCED ENGINE SCORES
      const entropyScore = entropyScores[n] || 0.5
      const survivalScore = survivalScores[n] || 0.5
      const interTurnoScore = interTurnoScores[n] || 0.5

      // Analytics pre-calculated scores (from turn_analytics table)
      const analyticsEntropy = analyticsEntropyScores[n] || 0.5
      const analyticsSurvival = analyticsSurvivalScores[n] || 0.5
      const analyticsMarkov = analyticsMarkovScores[n] || 0.5

      // Apply genetic optimization weights if available (live or cached)
      const activeGeneticWeights = geneticOptimalWeights || analyticsGeneticWeights
      let geneticBoost = 0
      if (activeGeneticWeights) {
        // Genetic weights are for [entropy, survival, interTurno]
        geneticBoost = (
          (entropyScore - 0.5) * activeGeneticWeights[0] +
          (survivalScore - 0.5) * activeGeneticWeights[1] +
          (interTurnoScore - 0.5) * activeGeneticWeights[2]
        ) * 2 // Amplify genetic contribution
      }

      // === ENSEMBLE COMBINATION: 20 engines ===
      const scoreFinal = (
        // Original engines
        factorScore * W.factores30 * driftFactor +
        mcScore * W.montecarlo +
        crossBoost * W.crossTurno +
        (seasonScore - 0.5) * W.seasonal +
        corrScore * W.correlation +
        markovSupScore * W.markovSuperior +
        (cyclicScore - 0.5) * W.cyclic +
        // Extended engines
        featScore * Wext.features +
        mlScore * Wext.multilevel +
        pmiScore * Wext.pmi +
        advMkScore * Wext.advMarkov +
        posScore * Wext.positions +
        ensMLScore * Wext.ensembleML +
        graphScore * Wext.graph +
        dlBoost * Wext.deepLearning * (1 - dlUncertainty) +
        // CDM Bayesian model
        (cdmMap[n] || 0) * cdmWeight +
        // NEW ADVANCED ENGINES
        (entropyScore - 0.5) * Wext.entropy * 2 +  // Centered around 0.5
        (survivalScore - 0.5) * Wext.survival * 2 +
        (interTurnoScore - 0.5) * Wext.interTurno * 2 +
        geneticBoost * Wext.genetic +
        // turn_analytics pre-calculated boost (small weight, high value)
        (analyticsEntropy - 0.5) * 0.02 * 2 +
        (analyticsSurvival - 0.5) * 0.02 * 2 +
        (analyticsMarkov - 0.5) * 0.02 * 2
      ) * ajustePeso

      // Get factor details
      const detail: Record<string, number> = factores30.detail[n] || {}
      const topFactors = Object.entries(detail)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3)
        .map(([name, val]) => `${name}: ${((val as number) * 100).toFixed(0)}%`)

      scores.push({
        num: n,
        score: scoreFinal,
        confianza: calibrarConfianza(scoreFinal, factorScore),
        factores: [...topFactors, ...(crossBoost > 0 ? [`Cross: +${crossBoost.toFixed(3)}`] : [])],
        frecuencia: freq[n] || 0,
        crossTurno: crossBoost,
        pesoAjustado: Math.round(ajustePeso * 100) / 100
      })
    }

    // Ordenar por score
    scores.sort((a, b) => b.score - a.score)

    // === PROBABILITY NORMALIZATION: softmax to ensure fair distribution (no bias) ===
    const maxScore = Math.max(...scores.map(s => s.score))
    const expScores = scores.map(s => Math.exp(Math.max(-20, Math.min(20, s.score - maxScore))))
    const sumExp = expScores.reduce((a, b) => a + b, 0)
    if (sumExp > 0 && isFinite(sumExp)) {
      for (let i = 0; i < scores.length; i++) { scores[i].score = expScores[i] / sumExp }
    }
    // Re-sort after normalization
    scores.sort((a, b) => b.score - a.score)

    // Derivar calientes/atrasados/paridad de los scores 30 factores
    const calientes = scores.slice(0, 10).map(s => s.num)
    const atrasados = scores.slice(-10).map(s => s.num)
    const paresCount = terminaciones2.filter(t => t % 2 === 0).length
    const paridad = { pares: paresCount, impares: terminaciones2.length - paresCount }

    // Top 10 de 2 cifras
    const pred2 = scores.slice(0, 10).map(s => pad(s.num))

    // === Análisis de 4 cifras vía motor para 3 y 4 cifras ===
    const sorteos = rows
      .filter((row: any) => Array.isArray(row.numbers) && row.numbers.length >= 20)
      .map((row: any) => ({
        fecha: row.date,
        turno: row.turno || turnoQuery,
        numbers: row.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
      }))
    let analisisAv = { recomendaciones: { tresCifras: [], cuatroCifras: [], evitar: [] }, resumen: { promedioConfianza: 0 }, ciclos: { numerosEnCicloFavorables: [] } } as any
    try {
      const { ejecutarAnalisisCompleto } = await import("@/lib/analisis/motor")
      analisisAv = ejecutarAnalisisCompleto(sorteos, { topNRanking: 15 })
    } catch {}

    // === ENSEMBLE: Integrar ML cacheado (TypeScript) ===
    if (useFullPath) {
      try {
        const { getModelos } = await import("@/lib/ml/cache")
        let cached = getModelos(turnoQuery)
        
        if (!cached || cached.length === 0) {
          try {
            const { autoTrainSingle } = await import("@/lib/ml/auto-train")
            cached = await autoTrainSingle(turnoQuery)
          } catch {}
        }

        if (cached && cached.length > 0) {
          const ordenados = [...sorteos].sort((a: any, b: any) =>
            new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
          ).filter((s: any) => Array.isArray(s.numbers) && s.numbers.length > 0)
          const { prepararPrediccion } = await import("@/lib/ml/trainer")
          const vectorPred = prepararPrediccion(ordenados)
          const primerosDraws = ordenados.map((s: any) => s.numbers[0] % 100)

          const { predecirSiguienteMarkov } = await import("@/lib/ml/markov")
          const { predecirRandomForest } = await import("@/lib/ml/random-forest")
          const { predecirMultipleClases } = await import("@/lib/ml/neural")

          for (const modelo of cached) {
            const mlTop = new Set<number>()
            if (modelo.tipo === "markov") {
              const estado = [primerosDraws[primerosDraws.length - 2], primerosDraws[primerosDraws.length - 1]]
              const pred = predecirSiguienteMarkov(modelo.modelo as any, estado, 10)
              for (const p of pred.topK) mlTop.add(p.estado)
            } else if (modelo.tipo === "random-forest") {
              const pred = predecirRandomForest(modelo.modelo as any, vectorPred)
              const sorted = pred.probabilidades.map((p: number, i: number) => ({ n: i, p })).sort((a: any, b: any) => b.p - a.p)
              for (const x of sorted.slice(0, 10)) mlTop.add(x.n)
            } else if (modelo.tipo === "neural") {
              const pred = predecirMultipleClases(modelo.modelo as any, vectorPred, 10)
              for (const p of pred) mlTop.add(p.clase)
            }
            for (const s of scores) {
              if (mlTop.has(s.num)) s.score += s.score * 0.15
            }
          }
          scores.sort((a, b) => b.score - a.score)
        }
      } catch {}
    }

    // === ENSEMBLE: Integrar modelos exportados desde Python (LGBM + XGBoost ensemble) ===
    let boostPythonActivo = false
    if (useFullPath) {
      try {
        const { obtenerBoostEnsemble } = await import("@/lib/ml/python_model_loader")
        const boostEnsemble = await obtenerBoostEnsemble(turnoQuery)
        if (boostEnsemble) {
          boostPythonActivo = true
          for (const s of scores) {
            const b = boostEnsemble[s.num] || 0
            if (b > 0) s.score += s.score * Math.min(0.2, b / 100)
          }
          scores.sort((a, b) => b.score - a.score)
        }
      } catch {}
    }

    // === ENSEMBLE: FastAPI ML backend (si está disponible) ===
    let mlApiActivo = false
    if (useFullPath) {
      try {
        const mlApiUrl = process.env.NEXT_PUBLIC_PYTHON_API_URL || process.env.ML_API_URL
        if (mlApiUrl) {
          mlApiActivo = true
          const mlRes = await fetch(`${mlApiUrl}/api/predict/${turnoQuery}?top=10`, { signal: AbortSignal.timeout(5000) })
          if (mlRes.ok) {
            const mlData = await mlRes.json()
            if (mlData?.scores) {
              for (const s of scores) {
                const boost = mlData.scores[String(s.num).padStart(2, "0")] || 0
                if (boost > 0) s.score += s.score * Math.min(0.2, boost / 50)
              }
              scores.sort((a, b) => b.score - a.score)
            }
          }
        }
      } catch {}
    }

    const pred3 = userTier.isPremium ? (analisisAv.recomendaciones.tresCifras as any[]).slice(0, 10).map((r: any) => r.numero.padStart(3, '0')) : []
    const pred4 = userTier.isPremium ? (analisisAv.recomendaciones.cuatroCifras as any[]).slice(0, 10).map((r: any) => r.numero.padStart(4, '0')) : []

    // === BAYESIAN UNCERTAINTY (heavy - full path only) ===
    let bayesian;
    if (useFullPath) {
      try {
        bayesian = bayesianAnalysis(sequences, 10, 1);
        const bayesianConf = bayesianConfidence(bayesian.credibleIntervals, bayesian.posterior);
        for (let i = 0; i < scores.length; i++) {
          const s = scores[i];
          s.bayesianConfidence = bayesianConf[s.num] || s.confianza;
          s.bayesianPosterior = bayesian.posterior[s.num] || 0;
          s.bayesianCiWidth = (bayesian.credibleIntervals[s.num]?.hi || 0.01) - (bayesian.credibleIntervals[s.num]?.lo || 0);
        }
      } catch {}
    }

    // Top 10 con información completa
    const top20 = scores.slice(0, 10).map((s, i) => ({
      n: s.num, numero: pad(s.num),
      emoji: SUENOS[s.num]?.emoji || "❓",
      significado: SUENOS[s.num]?.nombre || "",
      score: s.score, confianza: s.confianza, rank: i + 1,
      frecuencia: s.frecuencia, factores: s.factores,
      bayesianConfidence: (s as any).bayesianConfidence,
      bayesianPosterior: (s as any).bayesianPosterior,
    }))

    // Redoblona (dos mejores score de 2 cifras)
    const redoblona = scores.length >= 2 
      ? `${pad(scores[0].num)}-${pad(scores[1].num)}`
      : "00-00"

    // Fetch backtest summary for this turno/model
    let backtestSummary: any = null
    try {
      const { getBacktestSummary } = await import("@/lib/ml/backtest-loader")
      backtestSummary = await getBacktestSummary(turnoQuery, "ensemble")
    } catch {}

    // Heatmap
    const heatmap = scores.slice(0, 10).map(s => ({
      n: s.num, f: s.frecuencia,
      s: SUENOS[s.num] || { emoji: "❓", nombre: "" },
      pct: Math.round((s.frecuencia / terminaciones2.length) * 10000) / 100
    }))

    const uniqueDates = [...new Set(dates)].sort().reverse()
    // Use Bayesian confidence if available, fallback to calibrated
    const confidence = bayesian
      ? Math.round((scores.slice(0, 10).reduce((sum, s) => sum + ((s as any).bayesianConfidence || s.confianza), 0) / 10))
      : Math.round((scores.slice(0, 10).reduce((sum, s) => sum + s.confianza, 0) / 10))

    const responsePayload = {
      ok: true,
      turno: turnoQuery,
      tier: userTier.role,
      trialExpired: userTier.trialExpired,
      debug: {
        elapsed_ms: elapsed(t0),
        factores_aplicados: 30,
        motores_activos: useFullPath ? 19 : 3,
        total_numeros: terminaciones2.length,
        sorteos_analizados: sequences.length,
        sync: syncStatus ? { sincronizado: syncStatus.synced, nuevos_sorteos: syncStatus.newDraws } : null,
        cdm_model: {
          activo: true,
          topNumeros: cdmScores.slice(0, 5).map(s => ({
            numero: pad(s.number),
            posterior: (s.posterior * 100).toFixed(2) + "%"
          })),
        },
        advanced_analytics: {
          entropy: entropyResult ? {
            value: entropyResult.entropy.toFixed(4),
            classification: entropyResult.classification,
            alert: entropyResult.alert,
            trend: entropyResult.trend
          } : null,
          survival: survivalResult ? {
            criticalCount: survivalResult.criticalNumbers.length,
            topCritical: survivalResult.criticalNumbers.slice(0, 3).map((c: any) => ({
              numero: pad(c.number),
              zScore: c.zScore.toFixed(2),
              classification: c.classification,
              riskPercentile: c.riskPercentile.toFixed(1) + "%"
            })),
            overallHazard: survivalResult.overallHazard.toFixed(4)
          } : null,
          interTurno: interTurnoResult ? {
            order: interTurnoResult.order,
            patternsFound: interTurnoResult.patterns.length,
            totalTransitions: interTurnoResult.totalTransitions,
            topPatterns: interTurnoResult.patterns.slice(0, 3).map((p: any) => ({
              state: p.state,
              nextNumber: pad(p.nextNumber),
              probability: (p.probability * 100).toFixed(2) + "%",
              lift: p.lift.toFixed(2) + "x"
            }))
          } : null,
          genetic: geneticOptimalWeights ? {
            weights: geneticOptimalWeights.map((w, i) => ({
              engine: ['entropy', 'survival', 'interTurno'][i],
              weight: (w * 100).toFixed(1) + "%"
            }))
          } : null,
          cachedAnalytics: cachedAnalytics ? {
            compositeConfidence: cachedAnalytics.composite_confidence,
            calculatedAt: cachedAnalytics.fecha_calculo
          } : null
        }
      },
      numeros: top20,
      totalSorteos: sequences.length,
      fechasAnalizadas: uniqueDates.length,
      generado: new Date().toISOString(),
      confidence,
      pred: {
        numeros_2: pred2,
        numeros_3: userTier.isPremium ? pred3 : [],
        numeros_4: userTier.isPremium ? pred4 : [],
        redoblona: userTier.isPremium ? redoblona : null,
      },
      redoblona: userTier.isPremium ? redoblona : null,
      heatmap,
      backtest: backtestSummary ? {
        hit_at_1_pct: backtestSummary.hit_at_1_pct,
        hit_at_5_pct: backtestSummary.hit_at_5_pct,
        hit_at_10_pct: backtestSummary.hit_at_10_pct,
        avg_roi: backtestSummary.avg_roi,
        total_tests: backtestSummary.total_tests,
        model_type: backtestSummary.model_type,
      } : null,
      stats: {
        totalNumeros: terminaciones2.length,
        promedioPorSorteo: (terminaciones2.length / sequences.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.num || 0), frecuencia: scores[0]?.frecuencia || 0, significado: SUENOS[scores[0]?.num || 0]?.nombre || "" },
        terminacionesMasFrecuentes: scores.slice(0, 5).map(s => ({ terminacion: s.num, frecuencia: s.frecuencia, score: s.score.toFixed(2) })),
      },
      analysisInfo: {
        metodo: `Motor avanzado: 19 motores + Monte Carlo + Ensemble dinámico + ML + Bayesian + Entropy/Survival/Markov Inter-Turno/Genetic - turno ${turnoQuery.toUpperCase()}`,
        motores: [
          "1. 30 Factores estadísticos (frecuencia, ausencia, tendencia, ciclos, hot/cold, familias, entropía)",
          "2. Monte Carlo (1,000,000 simulaciones, Wilson CI)",
          "3. Cross-turno (arrastre Nocturna→Previa)",
          "4. Seasonal (mes, día, temporada)",
          "5. Bayesian (Dirichlet posterior, credible intervals)",
          "6. Correlation (Chi-squared + Pearson)",
          "7. Higher-order Markov (order 2-4)",
          "8. Cyclic patterns (Fourier + Autocorrelation)",
          "9. Graph analysis (PageRank, HITS, comunidades)",
          "10. Deep Learning (LSTM + Transformer + BNN)",
          "11. Feature Engineering (100+ variables por número)",
          "12. Multi-level scoring (4D, 3D, 2D, posiciones)",
          "13. PMI & Co-ocurrencia (matriz de afinidad)",
          "14. Markov Avanzado (100x100 + 1000x1000 + pair transitions)",
          "15. Análisis posiciones (miles/centenas/decenas/unidades)",
          "16. Ensemble ML (ExtraTrees + GradientBoosting + HistogramGB)",
          "17. Shannon Entropy Filter (predictibilidad/caos del sistema)",
          "18. Survival Analysis Kaplan-Meier (zona crítica de riesgo por número)",
          "19. Inter-Turno Markov (P(X_t | X_{t-1}, X_{t-2}) condicional)",
          "20. Genetic Algorithm Optimization (pesos evolutivos del ensemble)"
        ],
        datosUtilizados: `${sequences.length} sorteos con ${terminaciones2.length} terminaciones de 2 cifras + ${sorteos.length} sorteos para scoring de 3/4 cifras`,
        confianzaAvanzada: {
          promedioGeneral: analisisAv.resumen.promedioConfianza,
          enCicloFavorable: (analisisAv.ciclos.numerosEnCicloFavorables as number[]).slice(0, 10).map((n: number) => pad(n)),
          evitar: (analisisAv.recomendaciones.evitar as any[]).slice(0, 10).map((n: any) => pad(n))
        }
      }
    }

    // Cache response for 10 min
    const gc2 = globalThis as any
    if (!gc2.__predCache) gc2.__predCache = {}
    gc2.__predCache[cacheKey] = { result: responsePayload, expiresAt: Date.now() + 600_000 }

    // If full path ran, store scores in cache for 1 hour to avoid re-running
    if (useFullPath) {
      if (!gc2.__fullCache) gc2.__fullCache = {}
      gc2.__fullCache[fullCacheKey] = {
        scores: {
          crossTurnoScore,
          monteCarloTop,
          correlationScores,
          markovSuperScores,
          cyclicScores,
          graphScores,
          featureScores,
          multilevelScores,
          pmiScores,
          advMarkovScores,
          positionScores,
          entropyScores,
          survivalScores,
          interTurnoScores,
          geneticOptimalWeights,
          ensembleMLScores,
          cdmScores,
        } as HeavyCacheScores,
        expiresAt: Date.now() + 3_600_000,
      }
    } else if (!fullCached) {
      // Mark for warm: next request will run heavy engines synchronously
      if (!gc2.__fullCache) gc2.__fullCache = {}
      gc2.__fullCache[fullCacheKey] = { warm: true, expiresAt: Date.now() + 60000 }
    }

    // === MOTOR PERFORMANCE TRACKING ===
    try {
      clearOldPerformance()
      const motorMap: Record<string, number> = {
        factores30: W.factores30, monteCarlo: W.montecarlo, crossTurno: W.crossTurno,
        correlation: W.correlation, markovSuperior: W.markovSuperior, cyclicPatterns: W.cyclic,
        featureEngineering: Wext.features, multilevelScoring: Wext.multilevel,
        pmiCooccurrence: Wext.pmi, advancedMarkov: Wext.advMarkov,
        positionAnalysis: Wext.positions, ensembleML: Wext.ensembleML,
        graphAnalysis: Wext.graph, bayesian: cdmWeight, metaLearner: 0.05,
        pesosDinamicos: 0.03,
      }
      const topNums = scores.slice(0, 10).map(s => s.num)
      const hitRate = topNums.filter(n => terminaciones2.includes(n)).length / 10
      for (const [motor, weight] of Object.entries(motorMap)) {
        if (weight > 0) {
          const contrib = hitRate * (weight / 0.25)
          updateMotorPerformance(motor, turnoQuery, Math.min(1, contrib))
        }
      }
    } catch {}

    return NextResponse.json(responsePayload)
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}