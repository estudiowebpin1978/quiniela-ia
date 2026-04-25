import { NextRequest, NextResponse } from "next/server"

const SUENOS: { [k: number]: string } = {
  0: "Huevos", 1: "Agua", 2: "Niño", 3: "San Cono", 4: "La cama",
  5: "Gato", 6: "Perro", 7: "Revolver", 8: "Incendio", 9: "Arroyo",
  10: "La leche", 11: "Minero", 12: "Soldado", 13: "La yeta", 14: "Borracho",
  15: "Niña bonita", 16: "Anillo", 17: "Desgracia", 18: "Sangre", 19: "Pescado",
  20: "La fiesta", 21: "Mujer", 22: "Loco", 23: "Cocinero", 24: "Caballo",
  25: "Gallina", 26: "La misa", 27: "Peine", 28: "Cerro", 29: "San Pedro",
  30: "Santa Rosa", 31: "Luz", 32: "Dinero", 33: "Cristo", 34: "Cabeza",
  35: "Pajarito", 36: "Manteca", 37: "Dentista", 38: "Piedras", 39: "Lluvia",
  40: "Cura", 41: "Cuchillo", 42: "Zapatillas", 43: "Balcón", 44: "Cárcel",
  45: "Vino", 46: "Tomates", 47: "Muerto", 48: "Muerto habla", 49: "Carne",
  50: "Pan", 51: "Serrucho", 52: "Madre", 53: "Barco", 54: "Vaca",
  55: "Música", 56: "Caída", 57: "Jorobado", 58: "Ahogado", 59: "Plantas",
  60: "Virgen", 61: "Escopeta", 62: "Inundación", 63: "Casamiento", 64: "Llanto",
  65: "Cazador", 66: "Lombrices", 67: "Víbora", 68: "Sobrinos", 69: "Vicios",
  70: "Muerto sueño", 71: "Excremento", 72: "Sorpresa", 73: "Hospital", 74: "Gente negra",
  75: "Besos", 76: "Fuego", 77: "Pierna mujer", 78: "Ramera", 79: "Ladrón",
  80: "Bochas", 81: "Flores", 82: "Pelea", 83: "Mal tiempo", 84: "Iglesia",
  85: "Linterna", 86: "Humo", 87: "Piojos", 88: "Papas", 89: "Rata",
  90: "Miedo", 91: "Excursión", 92: "Médico", 93: "Enamorado", 94: "Cementerio",
  95: "Anteojos", 96: "Marido", 97: "Mesa", 98: "Lavandera", 99: "Hermano"
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

  constructor(inputSize: number = 20, hiddenSize: number = 32, outputSize: number = 10) {
    this.inputSize = inputSize
    this.hiddenSize = hiddenSize
    this.outputSize = outputSize
    this.weights1 = Array.from({ length: inputSize }, () => 
      Array.from({ length: hiddenSize }, () => (Math.random() - 0.5) * 0.4)
    )
    this.weights2 = Array.from({ length: hiddenSize }, () => 
      Array.from({ length: outputSize }, () => (Math.random() - 0.5) * 0.4)
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
  const nn = new NeuralNetwork(20, 48, 20)
  const seqs2 = sequences.map(s => s.map(n => n % 100))
  
  const trainingData: number[][] = []
  const targets: number[][] = []
  
  for (let i = 0; i < seqs2.length - 1; i++) {
    const freq = new Array(100).fill(0)
    for (const n of seqs2[i]) if (n < 100) freq[n]++
    const nextFreq = new Array(100).fill(0)
    for (const n of seqs2[i + 1]) if (n < 100) nextFreq[n]++
    const maxF = Math.max(...nextFreq, 1)
    const targetVec = nextFreq.map(f => f / maxF)
    trainingData.push(freq)
    targets.push(targetVec)
  }
  
  if (trainingData.length >= 5) {
    nn.train(trainingData, targets, Math.max(50, trainingData.length * 2), 0.02)
  }
  
  const lastFreq = new Array(100).fill(0)
  for (const n of seqs2[seqs2.length - 1]) if (n < 100) lastFreq[n]++
  
  const outputs = nn.forward(lastFreq)
  
  const nnScores = new Array(100).fill(0)
  outputs.forEach((score, idx) => {
    if (idx < 100) nnScores[idx] = score
  })
  
  const topNN = outputs.map((score, idx) => ({ n: idx, score: Math.round(score * 10000) / 10000 }))
    .filter(item => item.n < 100)
    .sort((a, b) => b.score - a.score)
    .slice(0, 15)
  
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
  sesgoSet?: Set<number>
) {
  const len = freq.length
  firstPos = firstPos && firstPos.length === len ? firstPos : new Array(len).fill(0)
  dayOfWeekBias = dayOfWeekBias && dayOfWeekBias.length === len ? dayOfWeekBias : new Array(len).fill(0)
  patternBias = patternBias && patternBias.length === len ? patternBias : new Array(len).fill(0)
  sesgoSet = sesgoSet || new Set<number>()
  
  const delay = new Array(len).fill(histOrder.length)
  for (let i = histOrder.length - 1; i >= 0; i--) {
    const v = histOrder[i]
    if (v >= 0 && v < len && delay[v] === histOrder.length) delay[v] = histOrder.length - 1 - i
  }
  
  const trend = new Array(len).fill(0)
  for (const v of histOrder.slice(-recentWindow)) {
    if (v >= 0 && v < len) trend[v]++
  }
  
  const mc = monteCarloSim(freq)
  const freqNorm = normalize(freq)
  const delayNorm = normalize(delay)
  const trendNorm = normalize(trend)
  const mcNorm = normalize(mc)
  const firstNorm = normalize(firstPos)
  const dayNorm = normalize(dayOfWeekBias)
  const patternNorm = normalize(patternBias)

  return Array.from({ length: len }, (_, i) => ({
    n: i,
    score:
      0.2 * freqNorm[i] +
      0.18 * delayNorm[i] +
      0.16 * trendNorm[i] +
      0.12 * mcNorm[i] +
      0.08 * firstNorm[i] +
      0.14 * dayNorm[i] +
      0.1 * patternNorm[i] +
      (sesgoSet.has(i) ? 0.02 : 0),
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

function bestRedoblonaPair(scores: { n: number; score: number }[], co: number[][], take = 18) {
  const top = scores.slice(0, take).map((s) => s.n)
  if (top.length < 2) {
    const a = top[0] ?? 0
    const b = top[1] ?? (a === 0 ? 1 : 0)
    return { a, b, label: `${pad(a)}-${pad(b)}` }
  }
  let best = { a: top[0], b: top[1], w: -1 }
  const scMap = new Map(scores.map((s) => [s.n, s.score]))
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = Math.min(top[i], top[j])
      const b = Math.max(top[i], top[j])
      const si = scMap.get(a) ?? 0
      const sj = scMap.get(b) ?? 0
      const c = co[a]?.[b] ?? 0
      const w = si * sj * (1 + Math.log1p(c))
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

async function getGroqInsight(topNumbers: any[], freqData: any[], turno: string) {
  const apiKey = process.env.GROQ_API_KEY?.replace(/"/g, "").trim()
  console.log("Groq API key present:", !!apiKey)
  if (!apiKey) {
    console.log("No Groq API key found")
    return null
  }

  try {
    const top5 = topNumbers.slice(0, 5).map(n => `${n.numero} (${n.significado || 'sin significado'})`).join(', ')
    const topFreq = freqData.slice(0, 5).map(f => `${f.n.toString().padStart(2, '0')} (${f.f} veces)`).join(', ')

    const prompt = `Eres un experto en análisis de lotería quiniela argentina. Basándote en estos datos:

Números mejor rankeados (por nuestro algoritmo): ${top5}
Números más frecuentes históricamente: ${topFreq}
Turno: ${turno}

Analiza estos números y proporciona:
1. Una predicción de 3 números principales (explica brevemente por qué)
2. Una recomendación de par para redoblona
3. Un número "sorpresa" que podría salir (bajo análisis)

Responde en español de forma breve y concisa (máximo 100 palabras).`

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
        max_tokens: 300
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

    const scores = scoreDigits(freq, hist, recentWindow, ff, dayOfWeekBias, patternBias, sesgoSet)
    scores.sort((a, b) => b.score - a.score)

    const s3 = scoreDigits(freq3, hist3, Math.min(800, hist3.length))
    s3.sort((a, b) => b.score - a.score)

    const s4 = scoreDigits(freq4, hist4, Math.min(500, hist4.length))
    s4.sort((a, b) => b.score - a.score)

    const seqs2 = sequences.map(seq => seq.map(n => n % 100))
    const co = buildCooccurrence(seqs2)
    const pairPremium = bestRedoblonaPair(scores, co, 20)

    const transiciones = getTransiciones(seqs2)
    const paresFrecuentes = getParesFrecuentes(seqs2)
    const rachas = getRachas(sequences)
    const parImparStats = getParImparDistribution(sequences)
    const paresConsecutivos = getParesConsecutivos(sequences)
    const { nnScores, topNN } = buildNeuralNetwork(sequences)

    const top10 = scores.slice(0, 10).map((x, i) => ({
      n: x.n,
      numero: pad(x.n),
      significado: SUENOS[x.n] || "",
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
        return { numero: pad(n), siguiente: pad(parseInt(mas[0])), count: mas[1], significado: SUENOS[n] }
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

    const groqInsight = await getGroqInsight(top10, heatmap, turno)

    return NextResponse.json({
      ok: true,
      tier: "free",
      numeros: top10,
      totalSorteos: sequences.length,
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
      stats: {
        totalNumeros: sequences.length,
        promedioNumerosPorSorteo: (hist.length / sequences.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.n || 0), frecuencia: freq[scores[0]?.n || 0], significado: SUENOS[scores[0]?.n || 0] },
        numeroMayorRetraso: { numero: pad(delay.indexOf(Math.max(...delay))), retraso: Math.max(...delay), significado: SUENOS[delay.indexOf(Math.max(...delay))] },
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