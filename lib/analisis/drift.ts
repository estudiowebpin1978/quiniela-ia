/**
 * DRIFT DETECTION - Detecta cambios en patrones de la lotería
 * 
 * Compara distribuciones recientes vs históricas para detectar
 * cuando los factores deben re-calibrarse.
 */

export interface DriftResult {
  drifted: boolean
  severity: number  // 0-1
  affectedFactors: string[]
  description: string
  recommendation: string
}

/**
 * Detecta si la distribución de números cambió significativamente.
 * Usa test de chi-cuadrado simplificado y comparación de entropía.
 */
export function detectDrift(
  recentDraws: number[][],   // últimos 20 sorteos
  historicalDraws: number[][] // últimos 200 sorteos
): DriftResult {
  if (recentDraws.length < 10 || historicalDraws.length < 50) {
    return { drifted: false, severity: 0, affectedFactors: [], description: "Datos insuficientes", recommendation: "Seguir usando pesos actuales" }
  }

  // 1. Comparar distribución de frecuencias
  const recentFreq = calcFreqDistribution(recentDraws)
  const histFreq = calcFreqDistribution(historicalDraws)
  const freqDrift = chiSquaredTest(recentFreq, histFreq)

  // 2. Comparar entropía
  const recentEntropy = calcEntropy(recentFreq)
  const histEntropy = calcEntropy(histFreq)
  const entropyDiff = Math.abs(recentEntropy - histEntropy) / histEntropy

  // 3. Detectar números "calientes" anómalos
  const recentHot = getHotNumbers(recentDraws, 5)
  const histHot = getHotNumbers(historicalDraws, 5)
  const hotOverlap = recentHot.filter(n => histHot.includes(n)).length
  const hotDrift = 1 - (hotOverlap / 5)

  // 4. Detectar si hay turnos con más/frecuencia desbalanceada
  const turnoImbalance = detectTurnoImbalance(recentDraws)

  // Score compuesto de drift
  const severity = Math.min(1, (freqDrift * 0.4 + entropyDiff * 0.3 + hotDrift * 0.2 + turnoImbalance * 0.1))

  const drifted = severity > 0.3
  const affectedFactors: string[] = []
  let description = ""
  let recommendation = ""

  if (freqDrift > 0.3) {
    affectedFactors.push("frecuenciaHistorica", "frecuencia100", "frecuencia20")
    description += "La distribución de frecuencias cambió significativamente. "
  }
  if (entropyDiff > 0.15) {
    affectedFactors.push("entropia", "clusters")
    description += `Entropía cambió ${(entropyDiff * 100).toFixed(1)}%. `
  }
  if (hotDrift > 0.5) {
    affectedFactors.push("hotNumbers", "coldNumbers", "momentum")
    description += "Los números calientes cambiaron drásticamente. "
  }
  if (turnoImbalance > 0.3) {
    affectedFactors.push("turnoDia")
    description += "Hay desbalance entre turnos. "
  }

  if (!drifted) {
    description = "Distribución estable"
    recommendation = "Pesos actuales son óptimos"
  } else if (severity < 0.5) {
    recommendation = "Reducir peso de factores de frecuencia, aumentar recencia"
  } else {
    recommendation = "Drift severo: confiar más en Monte Carlo y cross-turno, menos en frecuencia histórica"
  }

  return { drifted, severity, affectedFactors, description, recommendation }
}

/**
 * Ajusta pesos del motor de 30 factores según drift detectado.
 */
export function adjustWeightsForDrift(
  baseWeights: Record<string, number>,
  drift: DriftResult
): Record<string, number> {
  if (!drift.drifted) return baseWeights

  const adjusted = { ...baseWeights }
  const severityFactor = 1 - drift.severity

  // Reducir peso de factores afectados por drift
  for (const factor of drift.affectedFactors) {
    if (adjusted[factor] !== undefined) {
      adjusted[factor] *= severityFactor
    }
  }

  // Aumentar peso de factores robustos al drift
  const robustFactors = ["recenciaExponencial", "momentum", "markov", "coocurrencia"]
  for (const factor of robustFactors) {
    if (adjusted[factor] !== undefined) {
      adjusted[factor] *= (1 + drift.severity * 0.3)
    }
  }

  // Normalizar para que sumen ~1
  const total = Object.values(adjusted).reduce((a, b) => a + b, 0)
  if (total > 0) {
    for (const key of Object.keys(adjusted)) {
      adjusted[key] = adjusted[key] / total
    }
  }

  return adjusted
}

// === Helpers ===

function calcFreqDistribution(draws: number[][]): number[] {
  const freq = new Array(100).fill(0)
  let total = 0
  for (const draw of draws) {
    for (const n of draw) {
      const t = n % 100
      freq[t]++
      total++
    }
  }
  return freq.map(f => f / total)
}

function chiSquaredTest(observed: number[], expected: number[]): number {
  let chi2 = 0
  for (let i = 0; i < observed.length; i++) {
    const e = expected[i] || 0.001
    chi2 += ((observed[i] - e) ** 2) / e
  }
  // Normalizar a 0-1 (100 grados de libertad)
  return Math.min(1, chi2 / 200)
}

function calcEntropy(dist: number[]): number {
  let entropy = 0
  for (const p of dist) {
    if (p > 0) entropy -= p * Math.log2(p)
  }
  return entropy
}

function getHotNumbers(draws: number[][], n: number): number[] {
  const freq: Record<number, number> = {}
  for (const draw of draws) {
    for (const num of draw) {
      const t = num % 100
      freq[t] = (freq[t] || 0) + 1
    }
  }
  return Object.entries(freq)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([k]) => parseInt(k))
}

function detectTurnoImbalance(draws: number[][]): number {
  // Simple: comparar frecuencia de pares vs impares
  let pairs = 0, odds = 0
  for (const draw of draws) {
    for (const n of draw) {
      if (n % 2 === 0) pairs++
      else odds++
    }
  }
  const total = pairs + odds
  if (total === 0) return 0
  const ratio = pairs / total
  return Math.abs(ratio - 0.5) * 2 // 0 = balanced, 1 = fully imbalanced
}
