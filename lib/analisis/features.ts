/**
 * FEATURE EXTRACTION - 25 features per number
 * 
 * Generates feature vectors for ML training.
 * Each number (00-99) gets a 25-dimensional feature vector.
 */

export interface FeatureVector {
  number: number
  features: number[]
  label?: number  // 1 if appeared in next draw, 0 otherwise
}

export interface DrawRow {
  fecha: string
  turno: string
  numbers: number[]
}

const FEATURE_NAMES = [
  "frecuencia_10",
  "frecuencia_20",
  "frecuencia_50",
  "frecuencia_100",
  "ausencia",
  "dias_desde_ultima",
  "promedio_intervalo",
  "desviacion_intervalo",
  "momentum_7",
  "momentum_30",
  "ciclo_promedio",
  "repeticion",
  "coocurrencia",
  "espejo",
  "vecinos",
  "paridad",
  "raiz_digital",
  "suma_digitos",
  "dia_semana",
  "mes",
  "turno",
  "markov_anterior",
  "markov_2_anteriores",
  "entropia",
  "score_hot_cold",
]

export { FEATURE_NAMES }

// Helper: extract 2-cifras from draw
function extract2Cifras(draw: DrawRow): number[] {
  return draw.numbers.map(n => n % 100).filter(n => !isNaN(n))
}

// Feature 1-4: Frequency in windows
function frecuencia(numbers: number[][], n: number, target: number): number {
  const window = numbers.slice(0, n)
  let count = 0
  for (const seq of window) {
    if (seq.includes(target)) count++
  }
  return window.length > 0 ? count / window.length : 0
}

// Feature 5-6: Absence
function ausencia(numbers: number[][], target: number): { absence: number; daysSince: number } {
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i].includes(target)) {
      return { absence: i, daysSince: i }
    }
  }
  return { absence: numbers.length, daysSince: numbers.length }
}

// Feature 7-8: Interval stats
function intervalStats(numbers: number[][], target: number): { avg: number; std: number } {
  const positions: number[] = []
  numbers.forEach((seq, idx) => {
    if (seq.includes(target)) positions.push(idx)
  })
  if (positions.length < 2) return { avg: numbers.length, std: 0 }
  const intervals: number[] = []
  for (let i = 1; i < positions.length; i++) {
    intervals.push(positions[i] - positions[i - 1])
  }
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const variance = intervals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / intervals.length
  return { avg, std: Math.sqrt(variance) }
}

// Feature 9-10: Momentum
function momentum(numbers: number[][], target: number): { m7: number; m30: number } {
  let c7 = 0, c30 = 0
  numbers.slice(0, 7).forEach(seq => { if (seq.includes(target)) c7++ })
  numbers.slice(0, 30).forEach(seq => { if (seq.includes(target)) c30++ })
  const r7 = c7 / 7
  const r30 = c30 / 30
  return {
    m7: r7,
    m30: r30 > 0 ? (r7 - r30) / r30 : 0
  }
}

// Feature 11: Average cycle
function cicloPromedio(numbers: number[][], target: number): number {
  const positions: number[] = []
  numbers.forEach((seq, idx) => {
    if (seq.includes(target)) positions.push(idx)
  })
  if (positions.length < 2) return numbers.length
  let sum = 0
  for (let i = 1; i < positions.length; i++) sum += positions[i] - positions[i - 1]
  return sum / (positions.length - 1)
}

// Feature 12: Repeat probability
function repeticion(numbers: number[][], target: number): number {
  if (numbers.length < 2) return 0
  let repeated = 0
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i].includes(target) && numbers[i + 1].includes(target)) {
      repeated++
    }
  }
  let appeared = 0
  for (let i = 0; i < numbers.length - 1; i++) {
    if (numbers[i].includes(target)) appeared++
  }
  return appeared > 0 ? repeated / appeared : 0
}

// Feature 13: Co-occurrence score
function coocurrencia(numbers: number[][], target: number): number {
  const coocCount: Record<number, number> = {}
  for (const seq of numbers.slice(0, 50)) {
    if (seq.includes(target)) {
      for (const n of seq) {
        if (n !== target) coocCount[n] = (coocCount[n] || 0) + 1
      }
    }
  }
  const values = Object.values(coocCount)
  return values.length > 0 ? Math.max(...values) / 50 : 0
}

// Feature 14: Mirror score
function espejo(numbers: number[][], target: number): number {
  const tens = Math.floor(target / 10)
  const units = target % 10
  const mirror = units * 10 + tens
  let countTarget = 0, countMirror = 0
  for (const seq of numbers.slice(0, 50)) {
    if (seq.includes(target)) countTarget++
    if (seq.includes(mirror)) countMirror++
  }
  return (countTarget + countMirror) / 100
}

// Feature 15: Neighbor score
function vecinos(numbers: number[][], target: number): number {
  const neighbors = [(target - 2 + 100) % 100, (target - 1 + 100) % 100, (target + 1) % 100, (target + 2) % 100]
  let count = 0
  for (const seq of numbers.slice(0, 20)) {
    for (const n of neighbors) {
      if (seq.includes(n)) count++
    }
  }
  return count / 80
}

// Feature 16: Parity
function paridad(target: number): number {
  return target % 2 === 0 ? 1 : 0
}

// Feature 17: Digital root
function raizDigital(target: number): number {
  let n = target
  while (n >= 10) n = Math.floor(n / 10) + (n % 10)
  return n / 9
}

// Feature 18: Digit sum
function sumaDigitos(target: number): number {
  return (Math.floor(target / 10) + (target % 10)) / 18
}

// Feature 19: Day of week
function diaSemana(fecha: string): number {
  const d = new Date(fecha + "T12:00:00-03:00")
  return d.getDay() / 6
}

// Feature 20: Month
function mes(fecha: string): number {
  const d = new Date(fecha + "T12:00:00-03:00")
  return d.getMonth() / 11
}

// Feature 21: Turn encoded
function turnoCode(turno: string): number {
  const map: Record<string, number> = {
    previa: 0, primera: 0.25, matutina: 0.5, vespertina: 0.75, nocturna: 1
  }
  return map[turno.toLowerCase()] || 0.5
}

// Feature 22-23: Markov transition scores
function markovScores(numbers: number[][], target: number): { m1: number; m2: number } {
  if (numbers.length < 2) return { m1: 0, m2: 0 }
  // From last draw
  const lastDraw = numbers[0]
  let m1 = 0
  for (const n of lastDraw) {
    const t = n % 100
    // Simple: if target appears with this number often
    let cooc = 0
    for (const seq of numbers.slice(0, 50)) {
      if (seq.includes(t) && seq.includes(target)) cooc++
    }
    m1 += cooc
  }
  // From 2 draws ago
  let m2 = 0
  if (numbers.length >= 3) {
    const prevDraw = numbers[2]
    for (const n of prevDraw) {
      const t = n % 100
      let cooc = 0
      for (const seq of numbers.slice(0, 50)) {
        if (seq.includes(t) && seq.includes(target)) cooc++
      }
      m2 += cooc
    }
  }
  return { m1: Math.min(1, m1 / 200), m2: Math.min(1, m2 / 200) }
}

// Feature 24: Entropy
function entropia(numbers: number[][], target: number): number {
  let count = 0
  for (const seq of numbers) {
    if (seq.includes(target)) count++
  }
  const p = count / Math.max(numbers.length, 1)
  if (p === 0 || p === 1) return 0
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
}

// Feature 25: Hot/Cold score
function hotColdScore(numbers: number[][], target: number): number {
  let recent = 0, long = 0
  numbers.slice(0, 10).forEach(seq => { if (seq.includes(target)) recent++ })
  numbers.forEach(seq => { if (seq.includes(target)) long++ })
  const rRate = recent / 10
  const lRate = long / Math.max(numbers.length, 1)
  return lRate > 0 ? rRate / lRate : rRate > 0 ? 2 : 0.5
}

/**
 * Extract 25 features for a specific number
 */
export function extractFeatures(
  sequences: number[][],
  rows: DrawRow[],
  target: number
): number[] {
  const allNumbers = sequences.map(seq => seq.map(n => n % 100))

  const f1 = frecuencia(allNumbers, 10, target)
  const f2 = frecuencia(allNumbers, 20, target)
  const f3 = frecuencia(allNumbers, 50, target)
  const f4 = frecuencia(allNumbers, 100, target)
  const abs = ausencia(allNumbers, target)
  const f5 = abs.absence / Math.max(allNumbers.length, 1)
  const f6 = abs.daysSince / Math.max(allNumbers.length, 1)
  const interval = intervalStats(allNumbers, target)
  const f7 = interval.avg / Math.max(allNumbers.length, 1)
  const f8 = interval.std / Math.max(interval.avg, 1)
  const mom = momentum(allNumbers, target)
  const f9 = mom.m7
  const f10 = mom.m30
  const f11 = cicloPromedio(allNumbers, target) / Math.max(allNumbers.length, 1)
  const f12 = repeticion(allNumbers, target)
  const f13 = coocurrencia(allNumbers, target)
  const f14 = espejo(allNumbers, target)
  const f15 = vecinos(allNumbers, target)
  const f16 = paridad(target)
  const f17 = raizDigital(target)
  const f18 = sumaDigitos(target)
  const f19 = rows.length > 0 ? diaSemana(rows[0].fecha) : 0.5
  const f20 = rows.length > 0 ? mes(rows[0].fecha) : 0.5
  const f21 = rows.length > 0 ? turnoCode(rows[0].turno) : 0.5
  const mark = markovScores(allNumbers, target)
  const f22 = mark.m1
  const f23 = mark.m2
  const f24 = entropia(allNumbers, target)
  const f25 = hotColdScore(allNumbers, target)

  return [f1, f2, f3, f4, f5, f6, f7, f8, f9, f10, f11, f12, f13, f14, f15, f16, f17, f18, f19, f20, f21, f22, f23, f24, f25]
}

/**
 * Generate training data: features + labels for each draw
 */
export function generateTrainingData(
  rows: DrawRow[],
  windowSize: number = 50
): { X: number[][]; y: number[]; featureNames: string[] } {
  const X: number[][] = []
  const y: number[] = []

  // For each draw (after window), create training sample
  for (let i = windowSize; i < rows.length; i++) {
    const historical = rows.slice(i - windowSize, i).reverse()
    const actual = extract2Cifras(rows[i])

    for (let num = 0; num < 100; num++) {
      const features = extractFeatures(
        historical.map(r => extract2Cifras(r)),
        historical,
        num
      )
      X.push(features)
      y.push(actual.includes(num) ? 1 : 0)
    }
  }

  return { X, y, featureNames: FEATURE_NAMES }
}

/**
 * Generate prediction features for the next draw
 */
export function generatePredictionFeatures(
  rows: DrawRow[],
  windowSize: number = 50
): FeatureVector[] {
  const historical = rows.slice(-windowSize).reverse()
  const features: FeatureVector[] = []

  for (let num = 0; num < 100; num++) {
    features.push({
      number: num,
      features: extractFeatures(
        historical.map(r => extract2Cifras(r)),
        historical,
        num
      )
    })
  }

  return features
}
