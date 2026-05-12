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

function pad(n: number, l = 2): string {
  return String(n).padStart(l, "0")
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  if (max === min) return values.map(() => 0)
  return values.map((v) => (v - min) / (max - min))
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

function getTerminations(hist: number[]): number[] {
  const term = new Array(10).fill(0)
  for (const n of hist) {
    const t = n % 10
    if (t >= 0 && t <= 9) term[t]++
  }
  return term
}

function getLastPositions(sequences: number[][]): number[] {
  const lastPos = new Array(100).fill(0)
  for (const seq of sequences) {
    for (let i = 0; i < Math.min(seq.length, 5); i++) {
      const n = seq[i] % 100
      if (n >= 0 && n <= 99) lastPos[n] += (5 - i)
    }
  }
  return lastPos
}

function scoreDigitsForTurno(
  freq: number[],
  freq3: number[],
  hist: number[],
  hist3: number[],
  recentWindow: number,
  delay: number[],
  lastPositions: number[],
  terminationFreq: number[]
) {
  const len = 100
  
  const trend = new Array(len).fill(0)
  for (const n of hist.slice(-recentWindow)) {
    if (n >= 0 && n < len) trend[n]++
  }
  
  const mc = monteCarloSim(freq)
  
  const freqNorm = normalize(freq)
  const delayNorm = normalize(delay)
  const trendNorm = normalize(trend)
  const mcNorm = normalize(mc)
  const lastPosNorm = normalize(lastPositions)
  const termNorm = normalize(terminationFreq)
  
  const avgDelay = hist.length / len
  const overdue = delay.map(d => d > avgDelay * 1.5 ? 1 : 0)
  const overdueNorm = normalize(overdue)
  
  const maxF = Math.max(...freq, 1)
  const maxT = Math.max(...trend, 1)
  const maxD = Math.max(...delay, 1)
  
  return Array.from({ length: len }, (_, i) => {
    const freqScore = (freq[i] / maxF) * 0.35
    const recencyScore = (trend[i] / maxT) * 0.25
    const delayScore = (delay[i] / maxD) * 0.15
    const monteCarloScore = mcNorm[i] * 0.10
    const positionScore = lastPosNorm[i] * 0.08
    const termScore = termNorm[i] * 0.07
    
    return {
      n: i,
      score: freqScore + recencyScore + delayScore + monteCarloScore + positionScore + termScore,
      freq: freq[i],
      trend: trend[i],
      delay: delay[i]
    }
  }).sort((a, b) => b.score - a.score)
}

function scoreDigits3ForTurno(freq3: number[], hist3: number[], recentWindow: number) {
  const len = 1000
  
  const trend3 = new Array(len).fill(0)
  for (const n of hist3.slice(-recentWindow)) {
    if (n >= 0 && n < len) trend3[n]++
  }
  
  const mc = monteCarloSim(freq3)
  
  const freqNorm = normalize(freq3)
  const trendNorm = normalize(trend3)
  const mcNorm = normalize(mc)
  
  const maxF = Math.max(...freq3, 1)
  const maxT = Math.max(...trend3, 1)
  
  return Array.from({ length: len }, (_, i) => ({
    n: i,
    score: (freq3[i] / maxF) * 0.4 + (trend3[i] / maxT) * 0.35 + mcNorm[i] * 0.25
  })).sort((a, b) => b.score - a.score)
}

function getCooccurrence(sequences: number[][]): number[][] {
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

function getBestPair(scores: { n: number; score: number }[], co: number[][]) {
  const top = scores.slice(0, 18).map(s => s.n)
  if (top.length < 2) return { a: 0, b: 1, label: "00-01" }
  
  let best = { a: top[0], b: top[1], w: -1 }
  const scMap = new Map(scores.map(s => [s.n, s.score]))
  
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

function getCorrelationsBetweenTurnos(allTurnoData: Record<string, { freq: number[] }>): Record<string, number[]> {
  const correlations: Record<string, number[]> = {}
  const turnos = Object.keys(allTurnoData)
  
  for (let i = 0; i < turnos.length; i++) {
    for (let j = i + 1; j < turnos.length; j++) {
      const t1 = turnos[i]
      const t2 = turnos[j]
      const corr: number[] = []
      
      for (let n = 0; n < 100; n++) {
        const f1 = allTurnoData[t1].freq[n]
        const f2 = allTurnoData[t2].freq[n]
        if (f1 > 0 && f2 > 0) {
          corr.push(n)
        }
      }
      correlations[`${t1}-${t2}`] = corr.slice(0, 10)
    }
  }
  return correlations
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("sorteo") || "previa"

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

  if (!SB || !SK) {
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })
  }

  const turnosValidos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
  const turnoQuery = turno.toLowerCase()
  
  if (!turnosValidos.includes(turnoQuery)) {
    return NextResponse.json({ error: `Sorteo inválido. Válidos: ${turnosValidos.join(", ")}` }, { status: 400 })
  }

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 15000)

  try {
    const url = `${SB}/rest/v1/draws?select=date,turno,numbers&turno=eq.${turnoQuery}&order=date.desc&limit=10000`
    const res = await fetch(url, { 
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }, 
      signal: ctrl.signal 
    })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 })

    const rows = await res.json()
    if (!rows?.length) return NextResponse.json({ error: `Sin datos para turno ${turnoQuery}` }, { status: 500 })

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
    const freq = new Array(100).fill(0)
    const freq3 = new Array(1000).fill(0)

    for (const seq of sequences) {
      seq.forEach((n) => {
        const n2 = n % 100
        const n3 = n % 1000
        hist.push(n2)
        hist3.push(n3)
        freq[n2]++
        freq3[n3]++
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
    const lastPositions = getLastPositions(sequences)
    const terminationFreq = getTerminations(hist)

    const scores = scoreDigitsForTurno(freq, freq3, hist, hist3, recentWindow, delay, lastPositions, terminationFreq)
    const s3 = scoreDigits3ForTurno(freq3, hist3, Math.min(800, hist3.length))

    const co = getCooccurrence(sequences.map(s => s.map(n => n % 100)))
    const pair = getBestPair(scores, co)

    const top10 = scores.slice(0, 10).map((x, i) => ({
      n: x.n,
      numero: pad(x.n),
      emoji: SUENOS[x.n]?.emoji || "❓",
      significado: SUENOS[x.n]?.nombre || "",
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
      frecuencia: x.freq,
      retraso: x.delay,
      tendencia: x.trend,
    }))

    const pred3d = s3.slice(0, 5).map((x) => ({
      numero: pad(x.n, 3),
      score: Math.round(x.score * 10000) / 10000,
    }))

    const pred4d = s3.slice(0, 5).map((x, i) => {
      const base = scores[i % 10].n
      return {
        numero: pad(base, 2) + pad(s3[i].n % 100, 2),
        score: Math.round(x.score * 10000) / 10000,
      }
    })

    const heatmap = freq.map((f, n) => ({ 
      n, f, 
      s: SUENOS[n] || "",
      pct: Math.round((f / hist.length) * 10000) / 100
    }))

    const uniqueDates = [...new Set(dates)].sort().reverse()
    const confidence = Math.round((scores.slice(0, 10).reduce((sum, x) => sum + x.score, 0) / 10) * 100)

    return NextResponse.json({
      ok: true,
      turno: turnoQuery,
      numeros: top10,
      totalSorteos: sequences.length,
      fechasAnalizadas: uniqueDates.length,
      generado: new Date().toISOString(),
      confidence,
      pred: {
        numeros_2: top10.map(n => n.numero),
        numeros_3: pred3d.map(p => p.numero),
        numeros_4: pred4d.map(p => p.numero),
        redoblona: pair.label,
      },
      redoblona: pair.label,
      heatmap,
      stats: {
        totalNumeros: sequences.length,
        promedioPorSorteo: (hist.length / sequences.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.n || 0), frecuencia: freq[scores[0]?.n || 0], significado: SUENOS[scores[0]?.n || 0]?.nombre || "" },
        terminacionesMasFrecuentes: terminationFreq.map((f, i) => ({ terminacion: i, frecuencia: f })).sort((a, b) => b.frecuencia - a.frecuencia).slice(0, 5),
      },
      analysisInfo: {
        metodo: `Análisis independiente para turno ${turnoQuery.toUpperCase()}`,
        factores: ["Frecuencia histórica turno (35%)", "Recencia (25%)", "Retraso (15%)", "Monte Carlo (10%)", "Posiciones (8%)", "Terminaciones (7%)"],
        datosUtilizados: `${sequences.length} sorteos de ${turnoQuery}`
      }
    })
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }
    return NextResponse.json({ error: err?.message || "Error" }, { status: 500 })
  }
}