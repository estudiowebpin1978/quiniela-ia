interface CalibracionCurva {
  minScore: number;
  maxScore: number;
  hitRate: number;
  muestras: number;
}

const CURVA_BASE: CalibracionCurva[] = [
  { minScore: 0, maxScore: 20, hitRate: 0.00, muestras: 50 },
  { minScore: 20, maxScore: 30, hitRate: 0.06, muestras: 240 },
  { minScore: 30, maxScore: 40, hitRate: 0.11, muestras: 180 },
  { minScore: 40, maxScore: 50, hitRate: 0.26, muestras: 340 },
  { minScore: 50, maxScore: 60, hitRate: 0.78, muestras: 380 },
  { minScore: 60, maxScore: 100, hitRate: 0.83, muestras: 280 },
];

let curvaDinamica: CalibracionCurva[] | null = null;

const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()
const CACHE_TTL = 30 * 60 * 1000
let ultimaActualizacion = 0

async function fetchDrawsForCalibration(): Promise<number[][]> {
  const url = `${SB}/rest/v1/draws?select=numbers,date&order=date.desc&limit=100`
  try {
    const res = await fetch(url, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) return []
    const rows = await res.json()
    return rows
      .filter((r: any) => Array.isArray(r.numbers) && r.numbers.length >= 20)
      .map((r: any) => r.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n)))
  } catch {
    return []
  }
}

export async function recalibrar(): Promise<void> {
  const ahora = Date.now()
  if (ahora - ultimaActualizacion < CACHE_TTL) return
  ultimaActualizacion = ahora

  const draws = await fetchDrawsForCalibration()
  if (draws.length < 20) {
    curvaDinamica = null
    return
  }

  const ventana = 10
  const scores: { pred: number; real: boolean }[] = []
  const freqGlobal: Record<number, number> = {}

  for (const d of draws) for (const n of d) {
    const t = n % 100
    freqGlobal[t] = (freqGlobal[t] || 0) + 1
  }

  for (let i = ventana; i < draws.length; i++) {
    const hist = draws.slice(0, i)
    const target = draws[i]
    const freq = new Array(100).fill(0)
    for (const d of hist) for (const n of d) freq[n % 100]++
    const total = hist.length * 20
    const top10 = Object.entries(freq).map(([k, v]) => ({ n: parseInt(k), s: (v / total) * 10000 })).sort((a, b) => b.s - a.s).slice(0, 10)
    const realSet = new Set(Array.from(target, n => n % 100))
    for (const p of top10) {
      scores.push({ pred: p.s, real: realSet.has(p.n) })
    }
  }

  if (scores.length < 50) { curvaDinamica = null; return }

  const buckets = [0, 20, 30, 40, 50, 60, 100]
  const nuevaCurva: CalibracionCurva[] = []
  for (let b = 0; b < buckets.length - 1; b++) {
    const enBucket = scores.filter(s => s.pred >= buckets[b] && s.pred < buckets[b + 1])
    if (enBucket.length > 0) {
      nuevaCurva.push({
        minScore: buckets[b],
        maxScore: buckets[b + 1],
        hitRate: +(enBucket.filter(s => s.real).length / enBucket.length).toFixed(4),
        muestras: enBucket.length
      })
    }
  }

  if (nuevaCurva.length >= 3) curvaDinamica = nuevaCurva
}

export function calibrarConfianza(score: number, _confianzaOriginal: number): number {
  const curva = curvaDinamica || CURVA_BASE
  for (const punto of curva) {
    if (score >= punto.minScore && score < punto.maxScore) {
      return Math.min(95, Math.round(punto.hitRate * 100))
    }
  }
  return Math.min(95, Math.max(1, Math.round(score * 0.3)))
}

export function obtenerCurvaCalibracion(): CalibracionCurva[] {
  return curvaDinamica || CURVA_BASE
}
