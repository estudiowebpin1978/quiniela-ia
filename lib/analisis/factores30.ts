/**
 * MOTOR DE 30 FACTORES ESTADÍSTICOS
 * 
 * Calcula 30 factores de análisis para cada número (00-99).
 * Cada factor produce un score normalizado [0-1] para cada número.
 * Los pesos se calibran dinámicamente según rendimiento histórico.
 */

export interface FactorWeights {
  frecuenciaHistorica: number
  frecuencia100: number
  frecuencia20: number
  ausenciaActual: number
  recenciaExponencial: number
  tendencia: number
  ciclos: number
  mediaIntervalos: number
  desviacionIntervalos: number
  momentum: number
  persistencia: number
  rebote: number
  hotNumbers: number
  coldNumbers: number
  paresImpares: number
  bajosAltos: number
  sumaDigitos: number
  terminaciones: number
  raizDigital: number
  espejos: number
  vecinos: number
  familias: number
  coocurrencia: number
  markov: number
  turnoDia: number
  diaSemana: number
  mesAnio: number
  entropia: number
  clusters: number
  predccionIA: number
}

export const DEFAULT_WEIGHTS: FactorWeights = {
  frecuenciaHistorica: 0.08,
  frecuencia100: 0.10,
  frecuencia20: 0.08,
  ausenciaActual: 0.06,
  recenciaExponencial: 0.08,
  tendencia: 0.06,
  ciclos: 0.04,
  mediaIntervalos: 0.03,
  desviacionIntervalos: 0.03,
  momentum: 0.05,
  persistencia: 0.03,
  rebote: 0.03,
  hotNumbers: 0.04,
  coldNumbers: 0.02,
  paresImpares: 0.02,
  bajosAltos: 0.02,
  sumaDigitos: 0.02,
  terminaciones: 0.03,
  raizDigital: 0.01,
  espejos: 0.02,
  vecinos: 0.02,
  familias: 0.02,
  coocurrencia: 0.03,
  markov: 0.04,
  turnoDia: 0.03,
  diaSemana: 0.02,
  mesAnio: 0.01,
  entropia: 0.02,
  clusters: 0.02,
  predccionIA: 0.10,
}

export interface DrawRow {
  fecha: string
  turno: string
  numbers: number[]
}

export interface FactorScores {
  scores: Record<number, number>  // 0-99 → score [0-1]
  detail: Record<number, Record<string, number>>  // 0-99 → { factorName: score }
}

// ============================================
// FACTOR 1: Frecuencia histórica
// ============================================
function factorFrecuenciaHistorica(sequences: number[][]): Record<number, number> {
  const freq: Record<number, number> = {}
  let total = 0
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      freq[t] = (freq[t] || 0) + 1
      total++
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = (freq[i] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 2: Frecuencia últimos 100 sorteos
// ============================================
function factorFrecuencia100(sequences: number[][]): Record<number, number> {
  const last100 = sequences.slice(0, Math.min(100, sequences.length))
  const freq: Record<number, number> = {}
  for (const seq of last100) {
    for (const n of seq) {
      const t = n % 100
      freq[t] = (freq[t] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = (freq[i] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 3: Frecuencia últimos 20 sorteos
// ============================================
function factorFrecuencia20(sequences: number[][]): Record<number, number> {
  const last20 = sequences.slice(0, Math.min(20, sequences.length))
  const freq: Record<number, number> = {}
  for (const seq of last20) {
    for (const n of seq) {
      const t = n % 100
      freq[t] = (freq[t] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = (freq[i] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 4: Ausencia actual
// ============================================
function factorAusenciaActual(sequences: number[][]): Record<number, number> {
  const lastIdx: Record<number, number> = {}
  const maxIdx = sequences.length - 1
  sequences.forEach((seq, idx) => {
    for (const n of seq) {
      const t = n % 100
      lastIdx[t] = idx
    }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const absence = maxIdx - (lastIdx[i] ?? -1)
    scores[i] = Math.min(1, absence / Math.max(sequences.length, 1))
  }
  return scores
}

// ============================================
// FACTOR 5: Recencia exponencial
// ============================================
function factorRecenciaExponencial(sequences: number[][]): Record<number, number> {
  const scores: Record<number, number> = {}
  const lambda = 0.1  // decay factor
  for (let i = 0; i < 100; i++) {
    let score = 0
    sequences.forEach((seq, idx) => {
      if (seq.includes(i)) {
        score += Math.exp(-lambda * idx)
      }
    })
    scores[i] = score
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  for (let i = 0; i < 100; i++) {
    scores[i] /= maxScore
  }
  return scores
}

// ============================================
// FACTOR 6: Tendencia (primera mitad vs segunda mitad del histórico)
// ============================================
function factorTendencia(sequences: number[][]): Record<number, number> {
  const mid = Math.floor(sequences.length / 2)
  const firstHalf = sequences.slice(0, mid)
  const secondHalf = sequences.slice(mid)
  const freqFirst: Record<number, number> = {}
  const freqSecond: Record<number, number> = {}
  for (const seq of firstHalf) {
    for (const n of seq) { freqFirst[n % 100] = (freqFirst[n % 100] || 0) + 1 }
  }
  for (const seq of secondHalf) {
    for (const n of seq) { freqSecond[n % 100] = (freqSecond[n % 100] || 0) + 1 }
  }
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const f1 = (freqFirst[i] || 0) / Math.max(firstHalf.length, 1)
    const f2 = (freqSecond[i] || 0) / Math.max(secondHalf.length, 1)
    const diff = f2 - f1  // positiva = sube en segunda mitad
    scores[i] = diff > 0 ? 0.5 + Math.min(0.5, diff * 10) : 0.5 - Math.min(0.5, Math.abs(diff) * 10)
  }
  return scores
}

// ============================================
// FACTOR 7: Ciclos
// ============================================
function factorCiclos(sequences: number[][]): Record<number, number> {
  const appearances: Record<number, number[]> = {}
  sequences.forEach((seq, idx) => {
    for (const n of seq) {
      const t = n % 100
      if (!appearances[t]) appearances[t] = []
      appearances[t].push(idx)
    }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const apps = appearances[i] || []
    if (apps.length < 2) {
      scores[i] = 0.5
      continue
    }
    let sumDist = 0
    for (let j = 1; j < apps.length; j++) {
      sumDist += apps[j] - apps[j - 1]
    }
    const avgCycle = sumDist / (apps.length - 1)
    const lastSeen = apps[apps.length - 1]
    const sinceLast = sequences.length - lastSeen
    scores[i] = sinceLast >= avgCycle * 0.8 ? 0.8 : 0.3
  }
  return scores
}

// ============================================
// FACTOR 8: Media entre apariciones
// ============================================
function factorMediaIntervalos(sequences: number[][]): Record<number, number> {
  const appearances: Record<number, number[]> = {}
  sequences.forEach((seq, idx) => {
    for (const n of seq) {
      const t = n % 100
      if (!appearances[t]) appearances[t] = []
      appearances[t].push(idx)
    }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const apps = appearances[i] || []
    if (apps.length < 2) { scores[i] = 0.5; continue }
    let sum = 0
    for (let j = 1; j < apps.length; j++) sum += apps[j] - apps[j - 1]
    const avg = sum / (apps.length - 1)
    scores[i] = Math.min(1, avg / sequences.length)
  }
  return scores
}

// ============================================
// FACTOR 9: Desviación estándar de intervalos
// ============================================
function factorDesviacionIntervalos(sequences: number[][]): Record<number, number> {
  const appearances: Record<number, number[]> = {}
  sequences.forEach((seq, idx) => {
    for (const n of seq) {
      const t = n % 100
      if (!appearances[t]) appearances[t] = []
      appearances[t].push(idx)
    }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const apps = appearances[i] || []
    if (apps.length < 3) { scores[i] = 0.5; continue }
    const intervals: number[] = []
    for (let j = 1; j < apps.length; j++) intervals.push(apps[j] - apps[j - 1])
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((sum, v) => sum + (v - avg) ** 2, 0) / intervals.length
    const std = Math.sqrt(variance)
    // Lower deviation = more regular = higher score
    scores[i] = Math.max(0, 1 - std / Math.max(avg, 1))
  }
  return scores
}

// ============================================
// FACTOR 10: Momentum (tasa primera mitad vs segunda mitad del histórico)
// ============================================
function factorMomentum(sequences: number[][]): Record<number, number> {
  const mid = Math.floor(sequences.length / 2)
  const firstHalf = sequences.slice(0, mid)
  const secondHalf = sequences.slice(mid)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const countFirst = firstHalf.filter(seq => seq.includes(i)).length
    const countSecond = secondHalf.filter(seq => seq.includes(i)).length
    const rateFirst = countFirst / Math.max(firstHalf.length, 1)
    const rateSecond = countSecond / Math.max(secondHalf.length, 1)
    // Momentum = cómo cambia la tasa en la segunda mitad vs primera
    const momentum = rateFirst > 0 ? (rateSecond - rateFirst) / rateFirst : 0
    scores[i] = Math.max(0, Math.min(1, 0.5 + momentum * 2))
  }
  return scores
}

// ============================================
// FACTOR 11: Persistencia
// ============================================
function factorPersistencia(sequences: number[][]): Record<number, number> {
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    let streak = 0, maxStreak = 0, appearances = 0
    for (const seq of sequences) {
      if (seq.includes(i)) {
        streak++
        appearances++
        maxStreak = Math.max(maxStreak, streak)
      } else {
        streak = 0
      }
    }
    scores[i] = appearances > 0 ? Math.min(1, maxStreak / 3) : 0
  }
  return scores
}

// ============================================
// FACTOR 12: Rebote
// ============================================
function factorRebote(sequences: number[][]): Record<number, number> {
  const lastIdx: Record<number, number> = {}
  const maxIdx = sequences.length - 1
  sequences.forEach((seq, idx) => {
    for (const n of seq) { lastIdx[n % 100] = idx }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const absence = maxIdx - (lastIdx[i] ?? -1)
    // Numbers with long absence get rebote score
    scores[i] = absence > 20 ? Math.min(1, absence / 50) : absence > 10 ? 0.5 : 0.2
  }
  return scores
}

// ============================================
// FACTOR 13: Hot Numbers (frecuencia total histórica)
// ============================================
function factorHotNumbers(sequences: number[][]): Record<number, number> {
  const freq: Record<number, number> = {}
  sequences.forEach(seq => {
    for (const n of seq) { freq[n % 100] = (freq[n % 100] || 0) + 1 }
  })
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = (freq[i] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 14: Cold Numbers
// ============================================
function factorColdNumbers(sequences: number[][]): Record<number, number> {
  const lastIdx: Record<number, number> = {}
  const maxIdx = sequences.length - 1
  sequences.forEach((seq, idx) => {
    for (const n of seq) { lastIdx[n % 100] = idx }
  })
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const absence = maxIdx - (lastIdx[i] ?? -1)
    scores[i] = Math.min(1, absence / Math.max(sequences.length, 1))
  }
  return scores
}

// ============================================
// FACTOR 15: Pares/Impares
// ============================================
function factorParesImpares(sequences: number[][]): Record<number, number> {
  let paresCount = 0, imparesCount = 0, total = 0
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      if (t % 2 === 0) paresCount++
      else imparesCount++
      total++
    }
  }
  const paresRatio = total > 0 ? paresCount / total : 0.5
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const isPar = i % 2 === 0
    // Boost numbers matching the dominant parity
    scores[i] = isPar ? paresRatio : (1 - paresRatio)
  }
  return scores
}

// ============================================
// FACTOR 16: Bajos/Altos
// ============================================
function factorBajosAltos(sequences: number[][]): Record<number, number> {
  let bajos = 0, altos = 0, total = 0
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      if (t < 50) bajos++
      else altos++
      total++
    }
  }
  const bajosRatio = total > 0 ? bajos / total : 0.5
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = i < 50 ? bajosRatio : (1 - bajosRatio)
  }
  return scores
}

// ============================================
// FACTOR 17: Suma de dígitos
// ============================================
function factorSumaDigitos(sequences: number[][]): Record<number, number> {
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      const sum = Math.floor(t / 10) + (t % 10)
      freq[sum] = (freq[sum] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const sum = Math.floor(i / 10) + (i % 10)
    scores[i] = (freq[sum] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 18: Terminaciones (último dígito)
// ============================================
function factorTerminaciones(sequences: number[][]): Record<number, number> {
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      const lastDigit = t % 10
      freq[lastDigit] = (freq[lastDigit] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const lastDigit = i % 10
    scores[i] = (freq[lastDigit] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 19: Raíz digital
// ============================================
function factorRaizDigital(sequences: number[][]): Record<number, number> {
  function digitalRoot(n: number): number {
    while (n >= 10) {
      n = Math.floor(n / 10) + (n % 10)
    }
    return n
  }
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const dr = digitalRoot(n % 100)
      freq[dr] = (freq[dr] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const dr = digitalRoot(i)
    scores[i] = (freq[dr] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 20: Espejos
// ============================================
function factorEspejos(sequences: number[][]): Record<number, number> {
  // Mirror pairs: 13↔31, 24↔42, etc.
  const mirrorScore: Record<number, number> = {}
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const t = n % 100
      freq[t] = (freq[t] || 0) + 1
    }
  }
  for (let i = 0; i < 100; i++) {
    const tens = Math.floor(i / 10)
    const units = i % 10
    const mirror = units * 10 + tens
    mirrorScore[i] = ((freq[i] || 0) + (freq[mirror] || 0)) / 2
  }
  const maxScore = Math.max(...Object.values(mirrorScore), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = mirrorScore[i] / maxScore
  }
  return scores
}

// ============================================
// FACTOR 21: Vecinos
// ============================================
function factorVecinos(sequences: number[][]): Record<number, number> {
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) { freq[n % 100] = (freq[n % 100] || 0) + 1 }
  }
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const neighbors = [
      (i - 2 + 100) % 100, (i - 1 + 100) % 100,
      (i + 1) % 100, (i + 2) % 100
    ]
    const neighborScore = neighbors.reduce((sum, n) => sum + (freq[n] || 0), 0) / 4
    scores[i] = neighborScore
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  for (let i = 0; i < 100; i++) scores[i] /= maxScore
  return scores
}

// ============================================
// FACTOR 22: Familias (misma decena)
// ============================================
function factorFamilias(sequences: number[][]): Record<number, number> {
  const familyFreq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) {
      const family = Math.floor((n % 100) / 10)
      familyFreq[family] = (familyFreq[family] || 0) + 1
    }
  }
  const maxFreq = Math.max(...Object.values(familyFreq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const family = Math.floor(i / 10)
    scores[i] = (familyFreq[family] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 23: Co-ocurrencia
// ============================================
function factorCoocurrencia(sequences: number[][]): Record<number, number> {
  const cooc: Record<string, number> = {}
  for (const seq of sequences) {
    const unique = [...new Set(seq.map(n => n % 100))]
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${Math.min(unique[i], unique[j])}-${Math.max(unique[i], unique[j])}`
        cooc[key] = (cooc[key] || 0) + 1
      }
    }
  }
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    let total = 0
    for (let j = 0; j < 100; j++) {
      if (i === j) continue
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`
      total += cooc[key] || 0
    }
    scores[i] = total
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  for (let i = 0; i < 100; i++) scores[i] /= maxScore
  return scores
}

// ============================================
// FACTOR 24: Markov (transición)
// ============================================
function factorMarkov(sequences: number[][]): Record<number, number> {
  // Build transition matrix from recent draws
  const transition: Record<number, Record<number, number>> = {}
  for (let i = 0; i < sequences.length - 1; i++) {
    const current = sequences[i]
    const next = sequences[i + 1]
    for (const cn of current) {
      const ct = cn % 100
      if (!transition[ct]) transition[ct] = {}
      for (const nn of next) {
        const nt = nn % 100
        transition[ct][nt] = (transition[ct][nt] || 0) + 1
      }
    }
  }
  // Score based on last draw's transitions
  const lastDraw = sequences[0] || []
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    let total = 0
    for (const n of lastDraw) {
      const t = n % 100
      total += transition[t]?.[i] || 0
    }
    scores[i] = total
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  for (let i = 0; i < 100; i++) scores[i] /= maxScore
  return scores
}

// ============================================
// FACTOR 25: Turnos del día
// ============================================
function factorTurnoDia(rows: DrawRow[]): Record<number, number> {
  const turnoFreq: Record<string, Record<number, number>> = {}
  for (const row of rows) {
    const turno = (row.turno || "").toLowerCase()
    if (!turnoFreq[turno]) turnoFreq[turno] = {}
    for (const n of row.numbers) {
      const t = n % 100
      turnoFreq[turno][t] = (turnoFreq[turno][t] || 0) + 1
    }
  }
  // Use the most common turno for scoring
  const turnoCounts = Object.entries(turnoFreq).map(([t, f]) => ({
    turno: t,
    total: Object.values(f).reduce((a, b) => a + b, 0)
  })).sort((a, b) => b.total - a.total)
  const mainTurno = turnoCounts[0]?.turno || ""
  const freq = turnoFreq[mainTurno] || {}
  const maxFreq = Math.max(...Object.values(freq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    scores[i] = (freq[i] || 0) / maxFreq
  }
  return scores
}

// ============================================
// FACTOR 26: Día de la semana
// ============================================
function factorDiaSemana(rows: DrawRow[]): Record<number, number> {
  const dayFreq: Record<string, Record<number, number>> = {}
  for (const row of rows) {
    const d = new Date(row.fecha + "T12:00:00-03:00")
    const dayName = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][d.getDay()]
    if (!dayFreq[dayName]) dayFreq[dayName] = {}
    for (const n of row.numbers) {
      const t = n % 100
      dayFreq[dayName][t] = (dayFreq[dayName][t] || 0) + 1
    }
  }
  // Average across all days
  const scores: Record<number, number> = {}
  const days = Object.keys(dayFreq)
  for (let i = 0; i < 100; i++) {
    let sum = 0
    for (const day of days) {
      const freq = dayFreq[day]
      const maxFreq = Math.max(...Object.values(freq), 1)
      sum += (freq[i] || 0) / maxFreq
    }
    scores[i] = days.length > 0 ? sum / days.length : 0.5
  }
  return scores
}

// ============================================
// FACTOR 27: Mes del año
// ============================================
function factorMesAnio(rows: DrawRow[]): Record<number, number> {
  const monthFreq: Record<number, Record<number, number>> = {}
  for (const row of rows) {
    const d = new Date(row.fecha + "T12:00:00-03:00")
    const month = d.getMonth()
    if (!monthFreq[month]) monthFreq[month] = {}
    for (const n of row.numbers) {
      const t = n % 100
      monthFreq[month][t] = (monthFreq[month][t] || 0) + 1
    }
  }
  const scores: Record<number, number> = {}
  const months = Object.keys(monthFreq).map(Number)
  for (let i = 0; i < 100; i++) {
    let sum = 0
    for (const m of months) {
      const freq = monthFreq[m]
      const maxFreq = Math.max(...Object.values(freq), 1)
      sum += (freq[i] || 0) / maxFreq
    }
    scores[i] = months.length > 0 ? sum / months.length : 0.5
  }
  return scores
}

// ============================================
// FACTOR 28: Entropía
// ============================================
function factorEntropia(sequences: number[][]): Record<number, number> {
  // Calculate entropy of each number's appearance distribution
  const scores: Record<number, number> = {}
  const totalDraws = sequences.length
  for (let i = 0; i < 100; i++) {
    let count = 0
    for (const seq of sequences) {
      if (seq.includes(i)) count++
    }
    const p = count / totalDraws
    if (p === 0 || p === 1) {
      scores[i] = 0
    } else {
      // Higher entropy = more unpredictable = slightly higher score
      const entropy = -p * Math.log2(p) - (1 - p) * Math.log2(1 - p)
      scores[i] = entropy
    }
  }
  const maxScore = Math.max(...Object.values(scores), 1)
  for (let i = 0; i < 100; i++) scores[i] /= maxScore
  return scores
}

// ============================================
// FACTOR 29: Clusters K-Means (patrón frecuencia primera vs segunda mitad)
// ============================================
function factorClusters(sequences: number[][]): Record<number, number> {
  const mid = Math.floor(sequences.length / 2)
  const firstHalf = sequences.slice(0, mid)
  const secondHalf = sequences.slice(mid)
  const firstFreq: Record<number, number> = {}
  const secondFreq: Record<number, number> = {}
  firstHalf.forEach(seq => {
    for (const n of seq) firstFreq[n % 100] = (firstFreq[n % 100] || 0) + 1
  })
  secondHalf.forEach(seq => {
    for (const n of seq) secondFreq[n % 100] = (secondFreq[n % 100] || 0) + 1
  })
  const maxFirst = Math.max(...Object.values(firstFreq), 1)
  const maxSecond = Math.max(...Object.values(secondFreq), 1)
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const f1 = (firstFreq[i] || 0) / maxFirst
    const f2 = (secondFreq[i] || 0) / maxSecond
    // Emerging in second half (low first, high second) = good
    // Consistently high = good
    // Cooling off = medium
    // Cold = low
    scores[i] = f2 * 0.6 + f1 * 0.4
  }
  return scores
}

// ============================================
// FACTOR 30: Predicción IA (ensemble placeholder)
// ============================================
function factorPredccionIA(
  f1: Record<number, number>,
  f2: Record<number, number>,
  f3: Record<number, number>,
  f4: Record<number, number>,
  f5: Record<number, number>
): Record<number, number> {
  // Simple neural-like combination of top 5 factors
  const scores: Record<number, number> = {}
  for (let i = 0; i < 100; i++) {
    const inputs = [f1[i], f2[i], f3[i], f4[i], f5[i]]
    // Weighted combination with sigmoid-like activation
    const weighted = inputs.reduce((sum, v, idx) => {
      const w = [0.25, 0.20, 0.20, 0.20, 0.15][idx]
      return sum + v * w
    }, 0)
    // Sigmoid-like normalization
    scores[i] = 1 / (1 + Math.exp(-5 * (weighted - 0.5)))
  }
  return scores
}

// ============================================
// MAIN: Calculate all 30 factors
// ============================================
export function calcularFactores30(
  sequences: number[][],
  rows: DrawRow[],
  customWeights?: Partial<FactorWeights>
): FactorScores {
  const weights = { ...DEFAULT_WEIGHTS, ...customWeights }

  // Calculate all 30 factors
  const f1 = factorFrecuenciaHistorica(sequences)
  const f2 = factorFrecuencia100(sequences)
  const f3 = factorFrecuencia20(sequences)
  const f4 = factorAusenciaActual(sequences)
  const f5 = factorRecenciaExponencial(sequences)
  const f6 = factorTendencia(sequences)
  const f7 = factorCiclos(sequences)
  const f8 = factorMediaIntervalos(sequences)
  const f9 = factorDesviacionIntervalos(sequences)
  const f10 = factorMomentum(sequences)
  const f11 = factorPersistencia(sequences)
  const f12 = factorRebote(sequences)
  const f13 = factorHotNumbers(sequences)
  const f14 = factorColdNumbers(sequences)
  const f15 = factorParesImpares(sequences)
  const f16 = factorBajosAltos(sequences)
  const f17 = factorSumaDigitos(sequences)
  const f18 = factorTerminaciones(sequences)
  const f19 = factorRaizDigital(sequences)
  const f20 = factorEspejos(sequences)
  const f21 = factorVecinos(sequences)
  const f22 = factorFamilias(sequences)
  const f23 = factorCoocurrencia(sequences)
  const f24 = factorMarkov(sequences)
  const f25 = factorTurnoDia(rows)
  const f26 = factorDiaSemana(rows)
  const f27 = factorMesAnio(rows)
  const f28 = factorEntropia(sequences)
  const f29 = factorClusters(sequences)
  const f30 = factorPredccionIA(f1, f2, f13, f5, f10)

  // Combine with weights
  const allFactors = [
    { scores: f1, weight: weights.frecuenciaHistorica },
    { scores: f2, weight: weights.frecuencia100 },
    { scores: f3, weight: weights.frecuencia20 },
    { scores: f4, weight: weights.ausenciaActual },
    { scores: f5, weight: weights.recenciaExponencial },
    { scores: f6, weight: weights.tendencia },
    { scores: f7, weight: weights.ciclos },
    { scores: f8, weight: weights.mediaIntervalos },
    { scores: f9, weight: weights.desviacionIntervalos },
    { scores: f10, weight: weights.momentum },
    { scores: f11, weight: weights.persistencia },
    { scores: f12, weight: weights.rebote },
    { scores: f13, weight: weights.hotNumbers },
    { scores: f14, weight: weights.coldNumbers },
    { scores: f15, weight: weights.paresImpares },
    { scores: f16, weight: weights.bajosAltos },
    { scores: f17, weight: weights.sumaDigitos },
    { scores: f18, weight: weights.terminaciones },
    { scores: f19, weight: weights.raizDigital },
    { scores: f20, weight: weights.espejos },
    { scores: f21, weight: weights.vecinos },
    { scores: f22, weight: weights.familias },
    { scores: f23, weight: weights.coocurrencia },
    { scores: f24, weight: weights.markov },
    { scores: f25, weight: weights.turnoDia },
    { scores: f26, weight: weights.diaSemana },
    { scores: f27, weight: weights.mesAnio },
    { scores: f28, weight: weights.entropia },
    { scores: f29, weight: weights.clusters },
    { scores: f30, weight: weights.predccionIA },
  ]

  const factorNames = [
    "frecuenciaHistorica", "frecuencia100", "frecuencia20", "ausenciaActual",
    "recenciaExponencial", "tendencia", "ciclos", "mediaIntervalos",
    "desviacionIntervalos", "momentum", "persistencia", "rebote",
    "hotNumbers", "coldNumbers", "paresImpares", "bajosAltos",
    "sumaDigitos", "terminaciones", "raizDigital", "espejos",
    "vecinos", "familias", "coocurrencia", "markov",
    "turnoDia", "diaSemana", "mesAnio", "entropia",
    "clusters", "predccionIA",
  ]

  const combinedScores: Record<number, number> = {}
  const detail: Record<number, Record<string, number>> = {}

  for (let i = 0; i < 100; i++) {
    let totalScore = 0
    let totalWeight = 0
    detail[i] = {}
    for (let f = 0; f < allFactors.length; f++) {
      const val = allFactors[f].scores[i] || 0
      const w = allFactors[f].weight
      totalScore += val * w
      totalWeight += w
      detail[i][factorNames[f]] = val
    }
    combinedScores[i] = totalWeight > 0 ? totalScore / totalWeight : 0
  }

  return { scores: combinedScores, detail }
}
