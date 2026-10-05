/**
 * Blend puro del precompute: V6 + V7 + ML, diversidad MMR, candidatos 3/4
 * cifras, confianza (agreement / consistencia) y redondeos de presentación.
 *
 * Funciones SIN I/O (extraídas de app/api/cron-precompute/route.ts para dejar
 * el route como orquestador). La matemática es idéntica a la original: mismos
 * pesos, mismo orden de operaciones, mismos early returns y mismos redondeos.
 */

/** Predicción ya mezclada (2 cifras) en el formato del cache. */
export interface BlendedPrediction {
  n: number
  numero: string
  score: number
  factor_attribution: Record<string, number>
}

/** Pesos dinámicos por motor (V6 SQL + V7 TS + ML). */
export interface EngineWeights {
  V6: number
  V7: number
  ML: number
}

/** Candidato de 3/4 cifras con su score crudo de V6. */
export interface CandidatoCifra {
  numero: number
  v6Score: number
}

/** Candidato de 3/4 cifras con su score ya mezclado. */
export interface ScoreCifra {
  numero: number
  score: number
}

/** Resultado de la diversificación MMR determinista. */
export interface DiversidadResultado {
  /** Selección MMR (como mucho 10 elementos) */
  seleccion: BlendedPrediction[]
  /** (max - min) / max de los scores del top-10 */
  diversityRatio: number
  diversityNote: string
}

/** Resultado de confianza: agreement entre motores + consistencia del modelo. */
export interface ConfianzaResultado {
  agreement: number
  modelConsistency: number
}

/** lambda del MMR determinista: balance score vs diversidad basada en factores. */
export const LAMBDA_MMR = 0.7

/**
 * Redondeo a N decimales (misma fórmula que estaba inline en el route:
 * Math.round(x * 10^N) / 10^N).
 */
export function redondear(valor: number, decimales: number): number {
  const factor = 10 ** decimales
  return Math.round(valor * factor) / factor
}

/** "7" → "07" (pad a 2 cifras por la izquierda, igual que el original). */
export function formatNumero(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

/** Predicciones del ensemble V7 → shape del blend (factor_attribution vacío). */
export function v7ToBlended(
  predictions: Array<{ numero: string; score: number }>,
): BlendedPrediction[] {
  return predictions.map((p) => ({
    n: parseInt(p.numero),
    numero: p.numero,
    score: p.score,
    factor_attribution: {},
  }))
}

/** Scores del ML (Map número → score) → top-10 ordenado desc. */
export function mlToBlended(scores: Map<number, number>): BlendedPrediction[] {
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([num, score]) => ({
      n: num,
      numero: formatNumero(num),
      score,
      factor_attribution: {},
    }))
}

/**
 * Top-10 CRUDO por motor (sin pesos): alimenta engine_predictions_log y el
 * cálculo de confianza. No muta las entradas.
 */
export function numerosTop(
  v6Rows: Array<Record<string, unknown>> | null | undefined,
  v7Predictions: BlendedPrediction[],
  mlPredictions: BlendedPrediction[],
  limit = 10,
): { v6: number[]; v7: number[]; ml: number[] } {
  return {
    v6: (v6Rows || []).slice(0, limit).map((r) => r.numero as number),
    v7: v7Predictions.slice(0, limit).map((p) => p.n),
    ml: mlPredictions.slice(0, limit).map((p) => p.n),
  }
}

export interface BlendParams {
  v6Rows: Array<Record<string, unknown>> | null | undefined
  v7Predictions: BlendedPrediction[]
  mlPredictions: BlendedPrediction[]
  engineWeights: EngineWeights
}

/**
 * Blend V6 + V7 + ML con pesos dinámicos → top-10 ordenado por score desc.
 * V6 aporta sus primeras 20 filas; V7 y ML suman (o agregan) sobre el mismo
 * mapa de números.
 */
export function blendEngines(params: BlendParams): BlendedPrediction[] {
  const { v6Rows, v7Predictions, mlPredictions, engineWeights } = params
  const allNums = new Map<number, BlendedPrediction>()

  // V6 scores
  if (v6Rows && Array.isArray(v6Rows)) {
    for (const row of v6Rows.slice(0, 20)) {
      const num = row.numero as number
      const score = (row.puntaje_total as number) || 0
      const fa = (row.factor_attribution as Record<string, number>) || {}
      allNums.set(num, {
        n: num,
        numero: formatNumero(num),
        score: score * engineWeights.V6,
        factor_attribution: fa,
      })
    }
  }

  // V7 blend
  for (const pred of v7Predictions) {
    const existing = allNums.get(pred.n)
    const v7Score = pred.score * engineWeights.V7
    if (existing) {
      existing.score += v7Score
    } else {
      allNums.set(pred.n, { ...pred, score: v7Score })
    }
  }

  // ML blend
  for (const pred of mlPredictions) {
    const existing = allNums.get(pred.n)
    const mlScore = pred.score * engineWeights.ML
    if (existing) {
      existing.score += mlScore
    } else {
      allNums.set(pred.n, { ...pred, score: mlScore })
    }
  }

  // Sort and take top 10
  return Array.from(allNums.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}

/**
 * Meta-diversidad real (MMR determinista): selecciona reordenando el top-10
 * balanceando score (lambda) contra similitud de factor_attribution.
 * Nunca aleatorio: misma entrada → misma salida.
 */
export function diversifyMMR(
  blended: BlendedPrediction[],
  lambda: number = LAMBDA_MMR,
): DiversidadResultado {
  const maxScore = blended[0]?.score || 1
  const minScore = blended[blended.length - 1]?.score || 0
  const diversityRatio = maxScore > 0 ? (maxScore - minScore) / maxScore : 0

  const seleccion: BlendedPrediction[] = []
  const remaining = [...blended]
  while (seleccion.length < 10 && remaining.length > 0) {
    let bestMMR = -Infinity
    let bestIdx = 0
    for (let i = 0; i < remaining.length; i++) {
      const scoreNorm = remaining[i].score / maxScore
      // Similitud determinista basada en factor_attribution (no aleatorio)
      const maxSim = seleccion.length > 0
        ? Math.max(
            ...seleccion.map((s) => {
              const fa1 = remaining[i].factor_attribution as Record<string, number> || {}
              const fa2 = s.factor_attribution as Record<string, number> || {}
              const keys = Object.keys(fa1).filter((k) => fa2.hasOwnProperty(k))
              if (keys.length === 0) return 0
              const avgDiff =
                keys.reduce((acc, k) => acc + Math.abs((fa1[k] || 0) - (fa2[k] || 0)), 0) / keys.length
              return 1 - Math.min(avgDiff, 1) // 1 = iguales, 0 = completamente diferentes
            }),
          )
        : 0
      const mmr = lambda * scoreNorm - (1 - lambda) * maxSim
      if (mmr > bestMMR) {
        bestMMR = mmr
        bestIdx = i
      }
    }
    seleccion.push(remaining[bestIdx])
    remaining.splice(bestIdx, 1)
  }

  const diversityNote =
    diversityRatio < 0.05
      ? "BAJA DIVERSIDAD: MMR determinista aplicado (lambda=0.7, basado en factor_attribution)."
      : "Diversidad aceptable."

  return { seleccion, diversityRatio, diversityNote }
}

/** Filas RPC score_numbers_v6 → candidatos {numero, v6Score} (top-30). */
export function mapearCandidatosV6(
  rows: Array<Record<string, unknown>> | null | undefined,
  limit = 30,
): CandidatoCifra[] {
  return (rows || []).slice(0, limit).map((r) => ({
    numero: Number(r.numero ?? r.num_val),
    v6Score: Number(r.score_val ?? r.puntaje_total) || 0,
  }))
}

/**
 * Blend V6 + V7 + ML para candidatos de 3/4 cifras:
 * score = v6*W6 + v7*W7 + ml*WML (los ausentes cuentan 0), ordenado desc.
 */
export function blendCandidatos(
  candidatos: CandidatoCifra[],
  v7Scores: Map<number, number>,
  mlScores: Map<number, number>,
  engineWeights: EngineWeights,
): ScoreCifra[] {
  return candidatos
    .map((c) => {
      const v7s = v7Scores.get(c.numero) || 0
      const mls = mlScores.get(c.numero) || 0
      const blendedScore =
        c.v6Score * engineWeights.V6 + v7s * engineWeights.V7 + mls * engineWeights.ML
      return { numero: c.numero, score: blendedScore }
    })
    .sort((a, b) => b.score - a.score)
}

/** Top-10 de candidatos → strings con padding ("007", "1234"). */
export function formatCifras(scores: ScoreCifra[], cifras: 3 | 4): string[] {
  return scores.slice(0, 10).map((r) => String(r.numero).padStart(cifras, "0"))
}

/** Redoblona: cabeza + acompañante del top-10 (o null si hay menos de 2). */
export function construirRedoblona(
  top10nums: number[],
): { cabeza: string; acompanante: string } | null {
  return top10nums.length >= 2
    ? {
        cabeza: String(top10nums[0]).padStart(2, "0"),
        acompanante: String(top10nums[1]).padStart(2, "0"),
      }
    : null
}

/**
 * Confianza (NO probabilidad de acierto):
 * - agreement: % del top-10 V6 que también está en el top-10 V7 o ML.
 * - modelConsistency: histórico (tope 100 sorteos) y agreement, 50/50, en [0,1].
 */
export function calcularConfianza(
  topNums: { v6: number[]; v7: number[]; ml: number[] },
  totalDraws: number,
): ConfianzaResultado {
  const v6Top10 = new Set<number>(topNums.v6.slice(0, 10))
  const v7Top10 = new Set<number>(topNums.v7.slice(0, 10))
  const mlTop10 = new Set<number>(topNums.ml.slice(0, 10))

  // Agreement: % of V6 top-10 that also appear in V7 or ML top-10
  let agreementCount = 0
  for (const num of v6Top10) {
    if (v7Top10.has(num) || mlTop10.has(num)) agreementCount++
  }
  const agreement = agreementCount / Math.max(v6Top10.size, 1)

  // Modelo de consistencia (NO probabilidad de acierto)
  const modelConsistency = Math.min(
    1,
    Math.max(
      0,
      (Math.min(totalDraws, 100) / 100) * 0.5 + Math.max(0, Math.min(1, agreement)) * 0.5,
    ),
  )

  return { agreement, modelConsistency }
}
