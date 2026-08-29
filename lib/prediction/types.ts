/**
 * Types for cached prediction computation
 */
export interface PredictionInput {
  turno: string
  targetDate: string
  token: string
  userTier: {
    role: "free" | "premium" | "admin"
    isPremium: boolean
    isTrialActive: boolean
    trialExpired: boolean
    canAccess2Cifras: boolean
    canAccessPremiumFeatures: boolean
    canSavePrediction: boolean
    predictionsUsed: number
    predictionsRemaining: number
    premium_until: string | null
    daysRemaining: number | null
  }
}

export interface ScoreEntry {
  num: number
  numero: string
  score: number
  confianza: number
  rank: number
  frecuencia: number
  factores: string[]
}

export interface PredictionPayload {
  ok: boolean
  turno: string
  tier: string
  isPremium: boolean
  isTrialActive: boolean
  trialExpired: boolean
  predictionsUsed: number
  predictionsRemaining: number
  canAccessPremiumFeatures: boolean
  upgradeHint: string | null
  aiSummary: string | null
  aiProvider: string | null
  debug: {
    elapsed_ms: number
    factores_aplicados: number
    motores_activos: number
    total_numeros: number
    sorteos_analizados: number
    determinista: boolean
  }
  numeros: Array<{
    n: number
    numero: string
    emoji: string
    significado: string
    score: number
    confianza: number
    rank: number
    frecuencia: number
    factores: string[]
  }>
  totalSorteos: number
  fechasAnalizadas: number
  generado: string
  confidence: number
  pred: {
    numeros_2: string[]
    numeros_3: string[]
    numeros_4: string[]
    redoblona: string | null
  }
  redoblona: string | null
  heatmap: Array<{
    n: number
    f: number
    s: { emoji: string; nombre: string }
    pct: number
  }>
  stats: {
    totalNumeros: number
    promedioPorSorteo: string
    numeroMasFrecuente: { numero: string; frecuencia: number; significado: string }
    terminacionesMasFrecuentes: Array<{ terminacion: number; frecuencia: number; score: string }>
  }
  analysisInfo: {
    metodo: string
    motores: string[]
    datosUtilizados: string
  }
  confianza: {
    promedioGeneral: number
    enCicloFavorable: string[]
    evitar: string[]
  }
}