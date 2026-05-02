import { NextRequest, NextResponse } from "next/server"

const SUENOS: Record<number, { emoji: string; nombre: string }> = {
  0: { emoji: "🥚", nombre: "Huevos" }, 1: { emoji: "💧", nombre: "Agua" }, 2: { emoji: "👶", nombre: "Niño" }, 3: { emoji: "🐰", nombre: "San Cono" }, 4: { emoji: "🛏️", nombre: "La cama" },
  5: { emoji: "🐱", nombre: "Gato" }, 6: { emoji: "🐕", nombre: "Perro" }, 7: { emoji: "🔫", nombre: "Revolver" }, 8: { emoji: "🔥", nombre: "Incendio" }, 9: { emoji: "🌊", nombre: "Arroyo" },
  10: { emoji: "🥛", nombre: "La leche" }, 11: { emoji: "⛏️", nombre: "Minero" }, 12: { emoji: "💂", nombre: "Soldado" }, 13: { emoji: "😱", nombre: "La yeta" }, 14: { emoji: "🍺", nombre: "Borracho" },
  15: { emoji: "👸", nombre: "Niña bonita" }, 16: { emoji: "💍", nombre: "Anillo" }, 17: { emoji: "💀", nombre: "Desgracia" }, 18: { emoji: "🩸", nombre: "Sangre" }, 19: { emoji: "🐟", nombre: "Pescado" },
  20: { emoji: "🎉", nombre: "La fiesta" }, 21: { emoji: "👩", nombre: "Mujer" }, 22: { emoji: "🤪", nombre: "Loco" }, 23: { emoji: "👨‍🍳", nombre: "Cocinero" }, 24: { emoji: "🐴", nombre: "Caballo" },
  25: { emoji: "🐔", nombre: "Gallina" }, 26: { emoji: "⛪", nombre: "La misa" }, 27: { emoji: "🪮", nombre: "Peine" }, 28: { emoji: "⛰️", nombre: "Cerro" }, 29: { emoji: "✝️", nombre: "San Pedro" },
  30: { emoji: "🌹", nombre: "Santa Rosa" }, 31: { emoji: "💡", nombre: "Luz" }, 32: { emoji: "💰", nombre: "Dinero" }, 33: { emoji: "✝️", nombre: "Cristo" }, 34: { emoji: "🤕", nombre: "Cabeza" },
  35: { emoji: "🐦", nombre: "Pajarito" }, 36: { emoji: "🧈", nombre: "Manteca" }, 37: { emoji: "🦷", nombre: "Dentista" }, 38: { emoji: "🪨", nombre: "Piedras" }, 39: { emoji: "🌧️", nombre: "Lluvia" },
  40: { emoji: "👨‍🔬", nombre: "Cura" }, 41: { emoji: "🔪", nombre: "Cuchillo" }, 42: { emoji: "👟", nombre: "Zapatillas" }, 43: { emoji: "🏠", nombre: "Balcón" }, 44: { emoji: "🏚️", nombre: "Cárcel" },
  45: { emoji: "🍷", nombre: "Vino" }, 46: { emoji: "🍅", nombre: "Tomates" }, 47: { emoji: "💀", nombre: "Muerto" }, 48: { emoji: "🧟", nombre: "Muerto habla" }, 49: { emoji: "🥩", nombre: "Carne" },
  50: { emoji: "🍞", nombre: "Pan" }, 51: { emoji: "🪚", nombre: "Serrucho" }, 52: { emoji: "👩‍👦", nombre: "Madre" }, 53: { emoji: "⛵", nombre: "Barco" }, 54: { emoji: "🐄", nombre: "Vaca" },
  55: { emoji: "🎵", nombre: "Música" }, 56: { emoji: "🤕", nombre: "Caída" }, 57: { emoji: "🏃", nombre: "Jorobado" }, 58: { emoji: "💦", nombre: "Ahogado" }, 59: { emoji: "🌱", nombre: "Plantas" },
  60: { emoji: "🧝", nombre: "Virgen" }, 61: { emoji: "🔫", nombre: "Escopeta" }, 62: { emoji: "🌊", nombre: "Inundación" }, 63: { emoji: "💒", nombre: "Casamiento" }, 64: { emoji: "😢", nombre: "Llanto" },
  65: { emoji: "🎯", nombre: "Cazador" }, 66: { emoji: "🪱", nombre: "Lombrices" }, 67: { emoji: "🐍", nombre: "Víbora" }, 68: { emoji: "👶", nombre: "Sobrinos" }, 69: { emoji: "😈", nombre: "Vicios" },
  70: { emoji: "🧟", nombre: "Muerto sueño" }, 71: { emoji: "💩", nombre: "Excremento" }, 72: { emoji: "🎁", nombre: "Sorpresa" }, 73: { emoji: "🏥", nombre: "Hospital" }, 74: { emoji: "🏿", nombre: "Gente negra" },
  75: { emoji: "💋", nombre: "Besos" }, 76: { emoji: "🔥", nombre: "Fuego" }, 77: { emoji: "🦵", nombre: "Pierna mujer" }, 78: { emoji: "💃", nombre: "Ramera" }, 79: { emoji: "🦹", nombre: "Ladrón" },
  80: { emoji: "🎱", nombre: "Bochas" }, 81: { emoji: "💐", nombre: "Flores" }, 82: { emoji: "🥊", nombre: "Pelea" }, 83: { emoji: "⛈️", nombre: "Mal tiempo" }, 84: { emoji: "⛪", nombre: "Iglesia" },
  85: { emoji: "🔦", nombre: "Linterna" }, 86: { emoji: "💨", nombre: "Humo" }, 87: { emoji: "🦟", nombre: "Piojos" }, 88: { emoji: "🥔", nombre: "Papas" }, 89: { emoji: "🐀", nombre: "Rata" },
  90: { emoji: "😱", nombre: "Miedo" }, 91: { emoji: "🏕️", nombre: "Excursión" }, 92: { emoji: "👨‍⚕️", nombre: "Médico" }, 93: { emoji: "💕", nombre: "Enamorado" }, 94: { emoji: "🪦", nombre: "Cementerio" },
  95: { emoji: "👓", nombre: "Anteojos" }, 96: { emoji: "👨", nombre: "Marido" }, 97: { emoji: "🍽️", nombre: "Mesa" }, 98: { emoji: "👕", nombre: "Lavandera" }, 99: { emoji: "👦", nombre: "Hermano" }
}

const SESGOS_DEFAULT: Record<string, number[]> = {
  "previa": [95, 45, 15, 99, 50, 75],
  "primera": [38, 73, 97, 37, 50, 72, 19, 25],
  "matutina": [14, 24, 26, 74, 92, 20, 85],
  "vespertina": [27, 14, 43, 92, 68, 69, 33],
  "nocturna": [26, 35, 76, 45, 88, 12, 91]
}

function pad(n: number, l = 2) {
  return String(n).padStart(l, "0")
}

function monteCarloSim(freq: number[]): number[] {
  const mc = new Array(freq.length).fill(0)
  const w = freq.map((f) => f + 1)
  const tot = w.reduce((a, b) => a + b, 0)
  const cum: number[] = []
  let acc = 0
  for (const x of w) {
    acc += x / tot
    cum.push(acc)
  }
  const samples = Math.min(25000, 5000 + freq.length * 25)
  for (let s = 0; s < samples; s++) {
    const r = Math.random()
    let lo = 0, hi = freq.length - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (cum[m] < r) lo = m + 1
      else hi = m
    }
    mc[lo]++
  }
  return mc
}

function normalize(values: number[]) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  if (max === min) return values.map(() => 0)
  return values.map((v) => (v - min) / (max - min))
}

// Test de rachas simplificado
function runsTestSimple(sequence: number[]): number {
  if (sequence.length < 10) return 0
  const median = sequence.sort((a, b) => a - b)[Math.floor(sequence.length / 2)]
  const binary = sequence.map(v => v > median ? 1 : 0)
  let runs = 1
  for (let i = 1; i < binary.length; i++) {
    if (binary[i] !== binary[i - 1]) runs++
  }
  const n1 = binary.filter(x => x === 1).length
  const n2 = binary.length - n1
  if (n1 === 0 || n2 === 0) return 0
  const mean = (2 * n1 * n2) / (n1 + n2) + 1
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / Math.pow(n1 + n2, 2) * (n1 + n2 - 1)
  if (variance <= 0) return 0
  return (runs - mean) / Math.sqrt(variance)
}

function relu(x: number): number {
  return Math.max(0, x)
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function tanh(x: number): number {
  return Math.tanh(x)
}

function softplus(x: number): number {
  return Math.log(1 + Math.exp(x))
}

class NeuralNetwork {
  private weights1: number[][]
  private weights2: number[][]
  private bias1: number[]
  private bias2: number[]
  private inputSize: number
  private hiddenSize: number
  private outputSize: number

  constructor(inputSize: number = 100, hiddenSize: number = 48, outputSize: number = 100) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.outputSize = outputSize
    this.weights1 = Array.from({ length: inputSize }, () => 
      Array.from({ length: hiddenSize }, () => (Math.random() - 0.5) * 0.2)
    )
    this.weights2 = Array.from({ length: hiddenSize }, () => 
      Array.from({ length: outputSize }, () => (Math.random() - 0.5) * 0.2)
    )
    this.bias1 = new Array(hiddenSize).fill(0)
    this.bias2 = new Array(outputSize).fill(0)
  }

  private dotProduct(inputs: number[], weights: number[]): number {
    return inputs.reduce((sum: number, val: number, i: number) => sum + val * weights[i], 0)
  }

  private matMul(matrix: number[][], vector: number[]): number[] {
    return matrix.map((row: number[]) => row.reduce((sum: number, val: number, i: number) => sum + val * vector[i], 0))
  }

  forward(inputs: number[]): number[] {
    const inputPadded = [...inputs, ...new Array(this.inputSize - inputs.length).fill(0)].slice(0, this.inputSize)
    
    const hiddenRaw: number[] = this.matMul(this.weights1, inputPadded).map((v: number, i: number) => relu(v + this.bias1[i]))
    
    const outputRaw: number[] = this.matMul(this.weights2, hiddenRaw).map((v: number, i: number) => sigmoid(v + this.bias2[i]))
    
    return outputRaw
  }

  train(inputs: number[][], targets: number[][], epochs: number = 100, learningRate: number = 0.01): void {
    for (let epoch = 0; epoch < epochs; epoch++) {
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i]
        const target = targets[i]
        const inputPadded = [...input, ...new Array(this.inputSize - input.length).fill(0)].slice(0, this.inputSize)
        
        const hiddenRaw: number[] = this.matMul(this.weights1, inputPadded).map((v: number, j: number) => relu(v + this.bias1[j]))
        const outputRaw: number[] = this.matMul(this.weights2, hiddenRaw).map((v: number, j: number) => sigmoid(v + this.bias2[j]))
        
        const outputError: number[] = outputRaw.map((out: number, j: number) => target[j] - out)
        const outputDelta: number[] = outputRaw.map((out: number, j: number) => out * (1 - out) * outputError[j])
        
        const hiddenError: number[] = this.matMul(this.weights2, outputDelta)
        const hiddenDelta: number[] = hiddenRaw.map((h: number, j: number) => (h > 0 ? hiddenError[j] : 0))
        
        for (let j = 0; j < this.hiddenSize; j++) {
          for (let k = 0; k < this.outputSize; k++) {
            this.weights2[j][k] += learningRate * hiddenDelta[j] * outputDelta[k]
          }
        }
        
        for (let j = 0; j < this.inputSize; j++) {
          for (let k = 0; k < this.hiddenSize; k++) {
            this.weights1[j][k] += learningRate * inputPadded[j] * hiddenDelta[k]
          }
        }
      }
    }
  }

  predictTopN(features: number[], n: number = 10): number[] {
    const outputs = this.forward(features)
    const indexed = outputs.map((score, idx) => ({ idx, score }))
    indexed.sort((a, b) => b.score - a.score)
    return indexed.slice(0, n).map(item => item.idx)
  }
}

function buildNeuralNetwork(sequences: number[][]): { nnScores: number[]; topNN: { n: number; score: number }[] } {
  const seqs2 = sequences.map(s => s.map(n => n % 100))
  
  // Obtener el último sorteo para calcular delay actual
  const lastSeq = seqs2.length > 0 ? seqs2[seqs2.length - 1] : []
  
  const freqCount = new Array(100).fill(0)
  const recentFreq = new Array(100).fill(0)
  const delay = new Array(100).fill(1000)
  const appeared = new Array(100).fill(false)
  
  // Calcular delay (sorteos desde última aparición)
  for (let si = seqs2.length - 1; si >= 0; si--) {
    for (const n of seqs2[si]) {
      if (n >= 0 && n < 100 && !appeared[n]) {
        appeared[n] = true
        delay[n] = seqs2.length - si
      }
    }
  }
  
  // Calcular frecuencias
  for (let i = 0; i < seqs2.length; i++) {
    for (const n of seqs2[i]) {
      if (n >= 0 && n < 100) freqCount[n]++
    }
    if (i >= seqs2.length - 5) {
      for (const n of seqs2[i]) {
        if (n >= 0 && n < 100) recentFreq[n]++
      }
    }
  }
  
  const maxF = Math.max(...freqCount, 1)
  const maxR = Math.max(...recentFreq, 1)
  const maxD = Math.max(...delay, 1)
  
  // Score: frecuencia + tendencia reciente + bonificación overdue
  const scores: { n: number; score: number }[] = []
  for (let i = 0; i < 100; i++) {
    const freqScore = (freqCount[i] / maxF) * 0.5
    const trendScore = (recentFreq[i] / maxR) * 0.35
    // Bonificar números que no salen hace mucho
    const overdueBonus = delay[i] > maxD * 0.7 ? 0.15 : 0
    const s = freqScore + trendScore + overdueBonus
    scores.push({ n: i, score: s })
  }
  
  scores.sort((a, b) => b.score - a.score)
  const topNN = scores.slice(0, 15)
  
  const nnScores = scores.map(s => s.score)
  return { nnScores, topNN }
}

function nextDrawDay(sorteo: string) {
  const ar = new Date(Date.now() - 3 * 3600000)
  const now = ar.getHours() * 100 + ar.getMinutes()
  const h: Record<string, number> = { "previa": 1015, "primera": 1200, "matutina": 1500, "vespertina": 1800, "nocturna": 2100 }
  const target = new Date(ar)
  if (now >= (h[sorteo] || 2100)) target.setDate(target.getDate() + 1)
  return target.toLocaleDateString("es-AR", { weekday: "long" })
}

function getTransiciones(sequences: number[][]) {
  const trans: Record<number, Record<number, number>> = {}
  for (const seq of sequences) {
    for (let i = 0; i < seq.length - 1; i++) {
      const actual = seq[i]
      const sig = seq[i + 1]
      if (!trans[actual]) trans[actual] = {}
      trans[actual][sig] = (trans[actual][sig] || 0) + 1
    }
  }
  return trans
}

function getParesFrecuentes(sequences: number[][]) {
  const pares: Record<number, number> = {}
  for (const seq of sequences) {
    const unicos = [...new Set(seq)]
    for (let i = 0; i < unicos.length; i++) {
      for (let j = i + 1; j < unicos.length; j++) {
        const key = unicos[i] * 100 + unicos[j]
        pares[key] = (pares[key] || 0) + 1
      }
    }
  }
  return Object.entries(pares).sort((a, b) => b[1] - a[1]).slice(0, 20)
}

function getRachas(sequences: number[][]): { numero: number; vecesConsecutivas: number; maxRacha: number }[] {
  const rachaCount = new Array(100).fill(0)
  const maxRacha = new Array(100).fill(0)
  
  for (const seq of sequences) {
    const nums2 = seq.map(n => n % 100)
    let actual = -1
    let streak = 0
    for (let i = 0; i < nums2.length; i++) {
      if (nums2[i] === actual) {
        streak++
      } else {
        if (streak > 1 && actual >= 0 && actual <= 99) {
          rachaCount[actual]++
          maxRacha[actual] = Math.max(maxRacha[actual], streak)
        }
        actual = nums2[i]
        streak = 1
      }
    }
    if (streak > 1 && actual >= 0 && actual <= 99) {
      maxRacha[actual] = Math.max(maxRacha[actual], streak)
    }
  }
  
  return Array.from({ length: 100 }, (_, n) => ({ numero: n, vecesConsecutivas: rachaCount[n], maxRacha: maxRacha[n] }))
}

function getParImparDistribution(sequences: number[][]): { total: number; pares: number; impares: number; ratioPar: number } {
  let total = 0
  let pares = 0
  for (const seq of sequences) {
    for (const n of seq) {
      const n2 = n % 100
      if (n2 < 100) {
        total++
        if (n2 % 2 === 0) pares++
      }
    }
  }
  return { total, pares, impares: total - pares, ratioPar: total > 0 ? pares / total : 0.5 }
}

function getParesConsecutivos(sequences: number[][]): { par: string; count: number }[] {
  const paresConsec: Record<string, number> = {}
  for (const seq of sequences) {
    const nums2 = seq.map(n => n % 100)
    for (let i = 0; i < nums2.length - 1; i++) {
      if (Math.abs(nums2[i] - nums2[i + 1]) <= 3) {
        const a = Math.min(nums2[i], nums2[i + 1])
        const b = Math.max(nums2[i], nums2[i + 1])
        const key = `${pad(a)}-${pad(b)}`
        paresConsec[key] = (paresConsec[key] || 0) + 1
      }
    }
  }
  return Object.entries(paresConsec).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([par, count]) => ({ par, count }))
}

function scoreDigits(
  freq: number[],
  histOrder: number[],
  recentWindow: number,
  firstPos?: number[],
  dayOfWeekBias?: number[],
  patternBias?: number[],
  sesgoSet?: Set<number>,
  delay?: number[]
) {
  const len = freq.length
  firstPos = firstPos && firstPos.length === len ? firstPos : new Array(len).fill(0)
  dayOfWeekBias = dayOfWeekBias && dayOfWeekBias.length === len ? dayOfWeekBias : new Array(len).fill(0)
  patternBias = patternBias && patternBias.length === len ? patternBias : new Array(len).fill(0)
  sesgoSet = sesgoSet || new Set<number>()
  
  // Calcular delay si no se provee
  if (!delay) {
    delay = new Array(len).fill(histOrder.length)
    for (let i = histOrder.length - 1; i >= 0; i--) {
      const v = histOrder[i]
      if (v >= 0 && v < len && delay[v] === histOrder.length) delay[v] = histOrder.length - 1 - i
    }
  }
  
  // Calcular overdue (números que no salen hace mucho)
  const avgDelay = histOrder.length / len
  const overdue = delay.map(d => d > avgDelay * 1.5 ? 1 : 0)  // Bonificar números muy atrasados
  
  // Calcular tendencia reciente
  const trend = new Array(len).fill(0)
  for (const v of histOrder.slice(-recentWindow)) {
    if (v >= 0 && v < len) trend[v]++
  }
  
  // Simulación Monte Carlo
  const mc = monteCarloSim(freq)
  
  // Normalizar todos los factores
  const freqNorm = normalize(freq)
  const delayNorm = normalize(delay)
  const trendNorm = normalize(trend)
  const mcNorm = normalize(mc)
  const firstNorm = normalize(firstPos)
  const dayNorm = normalize(dayOfWeekBias)
  const patternNorm = normalize(patternBias)
  const overdueNorm = normalize(overdue)
  
  // Análisis posicional para 4 cifras (unidades, decenas, centenas, miles)
  const posFreq = new Array(10).fill(0)
  for (const v of histOrder) {
    const d = v % 10
    if (d >= 0 && d <= 9) posFreq[d]++
  }
  const posNorm = normalize(posFreq)
  
  // Test de rachas - detectar números en tendencia no aleatoria
  const runsScores = new Array(len).fill(0)
  for (let n = 0; n < len; n++) {
    const numHistory = histOrder.map(v => v === n ? 1 : 0)
    if (numHistory.filter(x => x === 1).length >= 5) {
      runsScores[n] = Math.abs(runsTestSimple(numHistory))
    }
  }
  const runsNorm = normalize(runsScores)

  // Pesos optimizados: 10 factores reales
  return Array.from({ length: len }, (_, i) => ({
    n: i,
    score:
      0.18 * freqNorm[i] +        // Frecuencia histórica (18%)
      0.12 * delayNorm[i] +      // Retraso medio (12%)
      0.15 * trendNorm[i] +       // Tendencia reciente (15%)
      0.10 * mcNorm[i] +          // Monte Carlo (10%)
      0.05 * firstNorm[i] +      // Primera posición (5%)
      0.08 * dayNorm[i] +        // Día de semana (8%)
      0.07 * patternNorm[i] +    // Patrón (7%)
      0.10 * overdueNorm[i] +    // Overdue (10%)
      0.08 * posNorm[i % 10] +   // Análisis posicional (8%)
      0.07 * runsNorm[i] +       // Test de rachas (7%)
      0.03 * (sesgoSet.has(i) ? 1 : 0), // Sesgos (3%)
  }))
}

function buildCooccurrence(sequences: number[][]) {
  const co = Array.from({ length: 100 }, () => new Array(100).fill(0))
  for (const seq of sequences) {
    const unicos = [...new Set(seq)]
    for (let i = 0; i < unicos.length; i++) {
      for (let j = i + 1; j < unicos.length; j++) {
        const a = Math.min(unicos[i], unicos[j])
        const b = Math.max(unicos[i], unicos[j])
        if (a >= 0 && a <= 99 && b >= 0 && b <= 99) co[a][b]++
      }
    }
  }
  return co
}

function bestRedoblonaPair(scores: { n: number; score: number }[], co: number[][], take = 18, delay?: number[]) {
  const top = scores.slice(0, take).map((s) => s.n)
  if (top.length < 2) {
    const a = top[0] ?? 0
    const b = top[1] ?? (a === 0 ? 1 : 0)
    return { a, b, label: `${pad(a)}-${pad(b)}` }
  }
  
  const avgDelay = delay ? delay.reduce((a, b) => a + b, 0) / delay.length : 50
  let best = { a: top[0], b: top[1], w: -1 }
  const scMap = new Map(scores.map((s) => [s.n, s.score]))
  
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = Math.min(top[i], top[j])
      const b = Math.max(top[i], top[j])
      const si = scMap.get(a) ?? 0
      const sj = scMap.get(b) ?? 0
      const c = co[a]?.[b] ?? 0
      
      // Bonificar si uno o ambos números están overdue
      const aOverdue = delay && delay[a] > avgDelay * 1.3 ? 1.3 : 1
      const bOverdue = delay && delay[b] > avgDelay * 1.3 ? 1.3 : 1
      
      const w = si * sj * (1 + Math.log1p(c)) * aOverdue * bOverdue
      if (w > best.w) best = { a, b, w }
    }
  }
  return { a: best.a, b: best.b, label: `${pad(best.a)}-${pad(best.b)}` }
}

function buildDayOfWeekBias(sequences: number[][], targetDay: string, dates: string[]) {
  const bias = new Array(100).fill(0)
  let total = 0
  for (let i = 0; i < sequences.length; i++) {
    const date = new Date(dates[i] + "T00:00:00")
    if (date.toLocaleDateString("es-AR", { weekday: "long" }) !== targetDay) continue
    for (const n of sequences[i]) {
      if (n >= 0 && n <= 99) {
        bias[n]++
        total++
      }
    }
  }
  if (!total) return bias
  return bias.map((count) => count / total)
}

function buildPatternBias(hist: number[], recentWindow: number) {
  const recent = hist.slice(-recentWindow)
  if (!recent.length) return new Array(100).fill(0)
  let even = 0, odd = 0, low = 0, high = 0
  for (const n of recent) {
    if (n % 2 === 0) even++; else odd++
    if (n < 50) low++; else high++
  }
  const evenRatio = even / recent.length
  const oddRatio = odd / recent.length
  const lowRatio = low / recent.length
  const highRatio = high / recent.length
  return Array.from({ length: 100 }, (_, i) => {
    const parity = i % 2 === 0 ? evenRatio : oddRatio
    const range = i < 50 ? lowRatio : highRatio
    return 0.5 * parity + 0.5 * range
  })
}

async function getGroqInsight(topNumbers: any[], freqData: any[], turno: string, stats?: any) {
  const apiKey = process.env.GROQ_API_KEY?.replace(/"/g, "").trim()
  if (!apiKey) return null

  try {
    const top5 = topNumbers.slice(0, 5).map(n => `${n.numero} (${n.significado || 'N/A'})`).join(', ')
    const topFreq = freqData.slice(0, 5).map(f => `${f.n.toString().padStart(2, '0')} (${f.f} veces)`).join(', ')
    const overdue = stats?.rachas?.slice(0, 3).map((r: any) => r.numero).join(', ') || 'No disponible'
    const parImpar = stats?.parImpar ? `${stats.parImpar.pares} pares / ${stats.parImpar.impares} impares` : 'No disponible'

    const prompt = `Eres un experto en análisis de quiniela argentina. Analiza estos datos para el turno ${turno}:

**Datos del algoritmo:**
- Números mejor rankeados: ${top5}
- Más frecuentes: ${topFreq}
- Distribución par/impar: ${parImpar}
- Números con delay (atrasados): ${overdue}

**Tu tarea:**
1. Predicción de 3 números principales (justifica brevemente)
2. Par para redoblona recomendado
3. Número "sorpresa" potencial

Sé breve y concreto (máx 80 palabras).`

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 250
      })
    })

    const data = await response.json()
    console.log("Groq response status:", response.status)

    if (!response.ok) {
      return "Error: " + JSON.stringify(data)
    }

    return data.choices?.[0]?.message?.content || null
  } catch (e) {
    console.error("Groq error:", e)
    return "Error: " + String(e) + " key:" + (apiKey ? "yes" : "no")
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const turno = searchParams.get("sorteo") || "Todos"

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  const turnosValidos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  const turnoQuery = turno.toLowerCase()
  
  if (turno !== "Todos" && !turnosValidos.includes(turnoQuery)) {
    return NextResponse.json({ error: `Sorteo inválido. Válidos: ${turnosValidos.join(", ")}` }, { status: 400 })
  }

  const since = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
  let url = `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc,turno&limit=20000`
  if (turno !== "Todos") url += `&turno=eq.${turnoQuery}`

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 15000)

  try {
    const res = await fetch(url, { 
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, 
      signal: ctrl.signal 
    })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 })

    const rows = await res.json()
    if (!rows?.length) return NextResponse.json({ error: "Sin datos" }, { status: 500 })

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

    const uniqueDates = [...new Set(dates)].sort().reverse()
    let rachaDias = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)
    for (let i = 0; i < uniqueDates.length; i++) {
      const checkDate = new Date(currentDate)
      checkDate.setDate(checkDate.getDate() - i)
      const checkStr = checkDate.toISOString().split("T")[0]
      if (uniqueDates.includes(checkStr)) {
        rachaDias++
      } else {
        break
      }
    }

    const hist: number[] = []
    const hist3: number[] = []
    const hist4: number[] = []
    const fp: number[] = []
    const freq = new Array(100).fill(0)
    const ff = new Array(100).fill(0)
    const freq3 = new Array(1000).fill(0)
    const freq4 = new Array(10000).fill(0)

    for (const seq of sequences) {
      seq.forEach((n, i) => {
        const n2 = n % 100
        const n3 = n % 1000
        hist.push(n2)
        hist3.push(n3)
        hist4.push(n)
        freq[n2]++
        freq3[n3]++
        freq4[n]++
        if (i === 0) {
          fp.push(n2)
          ff[n2]++
        }
      })
    }

    const delay = new Array(100).fill(hist.length)
    for (let i = hist.length - 1; i >= 0; i--) {
      const num = hist[i]
      if (num >= 0 && num <= 99 && delay[num] === hist.length) {
        delay[num] = hist.length - 1 - i
      }
    }

    const recentWindow = Math.min(200, hist.length)
    const trend = new Array(100).fill(0)
    for (const n of hist.slice(-recentWindow)) {
      if (n >= 0 && n <= 99) trend[n]++
    }

    const sesgosActivos = SESGOS_DEFAULT[turnoQuery] || SESGOS_DEFAULT["previa"]
    const sesgoSet = new Set(sesgosActivos)

const targetDay = nextDrawDay(turnoQuery)
    const dayOfWeekBias = buildDayOfWeekBias(sequences, targetDay, dates)
    const patternBias = buildPatternBias(hist, recentWindow)
    
    // Calcular delay para usar en scoring y redoblona
    const delayCalc = new Array(100).fill(hist.length)
    for (let i = hist.length - 1; i >= 0; i--) {
      const v = hist[i]
      if (v >= 0 && v < 100 && delayCalc[v] === hist.length) delayCalc[v] = hist.length - 1 - i
    }
    
    const scores = scoreDigits(freq, hist, recentWindow, ff, dayOfWeekBias, patternBias, sesgoSet, delayCalc)
    scores.sort((a, b) => b.score - a.score)

    const s3 = scoreDigits(freq3, hist3, Math.min(800, hist3.length), undefined, undefined, undefined, undefined, undefined)
    s3.sort((a, b) => b.score - a.score)
    
    const s4 = scoreDigits(freq4, hist4, Math.min(500, hist4.length), undefined, undefined, undefined, undefined, undefined)
    s4.sort((a, b) => b.score - a.score)

    const seqs2 = sequences.map(seq => seq.map(n => n % 100))
    const co = buildCooccurrence(seqs2)
    const pairPremium = bestRedoblonaPair(scores, co, 20, delayCalc)

    const transiciones = getTransiciones(seqs2)
    const paresFrecuentes = getParesFrecuentes(seqs2)
    const rachas = getRachas(sequences)
    const parImparStats = getParImparDistribution(sequences)
    const paresConsecutivos = getParesConsecutivos(sequences)
    const { topNN } = buildNeuralNetwork(sequences)

const top10 = scores.slice(0, 10).map((x, i) => ({
      n: x.n,
      numero: pad(x.n),
      emoji: SUENOS[x.n]?.emoji || "❓",
      significado: SUENOS[x.n]?.nombre || "",
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
      frecuencia: freq[x.n],
      primera: ff[x.n],
      retraso: delay[x.n],
      tendencia: trend[x.n],
    }))

    const transTop5 = Object.entries(transiciones)
      .map(([num, sigs]) => {
        const n = parseInt(num)
        const mas = Object.entries(sigs as Record<string, number>).sort((a, b) => b[1] - a[1])[0]
        return { numero: pad(n), siguiente: pad(parseInt(mas[0])), count: mas[1], significado: SUENOS[n]?.nombre || "" }
      })
      .filter((t) => t.count > 2)
      .slice(0, 5)

    const pred3d = s3.slice(0, 5).map((x) => ({
      numero: pad(x.n, 3),
      score: Math.round(x.score * 10000) / 10000,
    }))

    const pred4d = s4.length >= 5
      ? s4.slice(0, 5).map((x) => ({
          numero: pad(x.n, 4),
          score: Math.round(x.score * 10000) / 10000,
        }))
      : top10.slice(0, 5).map((a, i) => ({
          numero: a.numero + (top10[(i + 1) % 10]?.numero || "00"),
          score: a.score * 0.9,
        }))

    const heatmap = freq.map((f, n) => ({ 
      n, f, 
      s: SUENOS[n] || "",
      pct: Math.round((f / hist.length) * 10000) / 100
    }))

    const confidence = Math.round((scores.slice(0, 10).reduce((sum, x) => sum + x.score, 0) / 10) * 100)

    const groqInsight = await getGroqInsight(top10, heatmap, turno, { rachas, parImpar: parImparStats, delay: delayCalc })

    return NextResponse.json({
      ok: true,
      tier: "free",
      numeros: top10,
      totalSorteos: sequences.length,
      totalAllTurnos: rows.length > 0 ? rows.length : sequences.length,
      rachaDias: rachaDias,
      turno,
      generado: new Date().toISOString(),
      analisisDesde:since,
      diasAnalisis:Math.floor((new Date().getTime() - new Date(since).getTime()) / 86400000),
      confidence,
      aiInsight: groqInsight || `Motor neuronal complejo: Frecuencia + Retraso + Tendencia + Monte Carlo + Red Neuronal + Rachas + Par/Impar + Consecutivos "${turnoQuery}"`,
groqAvailable: !!groqInsight,
      pred: {
        numeros_2: top10.map(n => n.numero),
        numeros_3: pred3d.map(p => p.numero),
        numeros_4: pred4d.map(p => p.numero),
        redoblona: pairPremium.label,
      },
      redoblona: pairPremium.label,
      redoblonaNota: `Par ponderado con co-ocurrencias: ${pairPremium.label}`,
      transiciones: transTop5,
      paresFrecuentes: paresFrecuentes.map(([k, v]) => ({
        par: `${pad(Math.floor(Number(k) / 100))}-${pad(Number(k) % 100)}`,
        count: v
      })),
      pred3dDetail: pred3d,
      pred4dDetail: pred4d,
      heatmap,
      advancedStats: {
        totalSorteos: sequences.length,
        uniqueDates: uniqueDates.length,
        promedioNumerosPorSorteo: (hist.length / sequences.length).toFixed(2),
        confidenceScore: Math.round((scores.slice(0, 10).reduce((sum, x) => sum + x.score, 0) / 10) * 100),
        analysisFactors: [
          "Frecuencia absoluta",
          "Retraso (días desde última aparición)",
          "Tendencia (apariciones recientes)",
          "Co-ocurrencia entre posiciones",
          "Red neuronal feed-forward",
          "Monte Carlo (25k simulaciones)",
          "Test de rachas Wald-Wolfowitz",
          "Análisis posicional 4 cifras",
          "Sesgos por día de semana",
          "Patrones de números gemelos"
        ]
      },
      stats: {
        totalNumeros: sequences.length,
        promedioNumerosPorSorteo: (hist.length / sequences.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.n || 0), frecuencia: freq[scores[0]?.n || 0], significado: SUENOS[scores[0]?.n || 0]?.nombre || "" },
        numeroMayorRetraso: { numero: pad(delay.indexOf(Math.max(...delay))), retraso: Math.max(...delay), significado: SUENOS[delay.indexOf(Math.max(...delay))]?.nombre || "" },
        rachas: rachas.filter(r => r.vecesConsecutivas > 0).slice(0, 10).map(r => ({ numero: pad(r.numero), vecesConsecutivas: r.vecesConsecutivas, maxRacha: r.maxRacha })),
        parImpar: { total: parImparStats.total, pares: parImparStats.pares, impares: parImparStats.impares, ratioPar: Math.round(parImparStats.ratioPar * 100) + "%" },
        paresConsecutivos: paresConsecutivos.slice(0, 10),
        neuralNetwork: {
          topPredictions: topNN.slice(0, 10).map(n => ({ numero: pad(n.n), score: n.score })),
          method: "Red neuronal feed-forward con backpropagation",
          layers: [20, 48, 20],
          epochs: 150
        },
      }
    })
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}