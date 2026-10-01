/**
 * OOS Walk-Forward Evaluation Harness
 *
 * Evalúa modelos candidatos con corte temporal estricto (sin fuga):
 * para cada draw i, el modelo solo ve draws[0..i-1] y predice top-N.
 *
 * Métricas por turno:
 *   - meanHits     : intersección media top-N vs 2C distinct del sorteo
 *   - pAtLeast1/3  : P(≥1) / P(≥3) aciertos
 *   - pWin         : Poceada P(≥5) · Quiniela P(≥1) [WON del app]
 *   - cabeza@10    : P(pos01 mod100 ∈ top-N)  (cabeza/redoblona)
 *   - mrr          : reciprocal rank del cabeza en el ranking completo
 *   - lift         : meanHits / esperanza aleatoria (hipergeométrica)
 *   - z            : score z vs hipergeométrica
 *
 * Run: npx tsx scripts/oos-eval.ts [--turnos=Primera,Poceada] [--warmup=60] [--step=1] [--no-ens] [--quick]
 */

import { createClient } from "@supabase/supabase-js"
import { predictV7, predictEnsembleV7, type Draw } from "../lib/analisis/engine-v7"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const supabase = createClient(url, key)

const ALL_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

// ── CLI args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
function arg(name: string, def: string): string {
  const f = args.find(a => a.startsWith(`--${name}=`))
  return f ? f.split("=").slice(1).join("=") : def
}
const turnosSel = arg("turnos", ALL_TURNOS.join(",")).split(",").map(s => s.trim()).filter(Boolean)
const warmup = parseInt(arg("warmup", "60"), 10)
const step = parseInt(arg("step", args.includes("--quick") ? "4" : "1"), 10)
const noEns = args.includes("--no-ens")

// ── Helpers ─────────────────────────────────────────────────────────────────

function twoC(numbers: number[]): Set<number> {
  return new Set(numbers.map(n => ((n % 100) + 100) % 100))
}

function topNFromScores(scores: number[], n: number): number[] {
  const idx = scores.map((s, i) => [s, i] as [number, number])
  idx.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  return idx.slice(0, n).map(x => x[1])
}

function freqModel(hist: Draw[], topN: number, window?: number, halfLife?: number): number[] {
  const c = new Array(100).fill(0)
  const src = window ? hist.slice(-window) : hist
  const lambda = halfLife ? Math.LN2 / halfLife : 0
  const n = src.length
  for (let i = 0; i < n; i++) {
    const w = halfLife ? Math.exp(-lambda * (n - 1 - i)) : 1
    for (const num of twoC(src[i].numbers)) c[num] += w
  }
  return topNFromScores(c, topN)
}

/** Beta-Binomial posterior mean de probabilidad de inclusión (2C) */
function bayesModel(hist: Draw[], topN: number, priorMean: number, strength = 20): number[] {
  const hits = new Array(100).fill(0)
  for (const d of hist) for (const num of twoC(d.numbers)) hits[num]++
  const a = strength * priorMean
  const b = strength * (1 - priorMean)
  const p = new Array(100)
  for (let i = 0; i < 100; i++) p[i] = (hits[i] + a) / (hist.length + a + b)
  return topNFromScores(p, topN)
}

function intersectionCount(pred: number[], target: Set<number>): number {
  let hits = 0
  for (const p of pred) if (target.has(p)) hits++
  return hits
}

function hypergeomVar(topN: number, K: number, N = 100): number {
  if (K <= 0 || K >= N) return 0
  const p = K / N
  return topN * p * (1 - p) * ((N - topN) / (N - 1))
}

interface ModelResult {
  hits: number[]          // aciertos por draw
  cabezaRank: number[]    // rank 1-based del cabeza en el ranking completo (1..100)
}

interface Agg {
  n: number
  meanHits: number
  pAtLeast1: number
  pAtLeast3: number
  pWin: number
  cabezaAtTop: number
  mrr: number
}

function aggregate(r: ModelResult, topN: number, winThreshold: number): Agg {
  const n = r.hits.length
  const totalHits = r.hits.reduce((a, b) => a + b, 0)
  return {
    n,
    meanHits: totalHits / n,
    pAtLeast1: r.hits.filter(h => h >= 1).length / n,
    pAtLeast3: r.hits.filter(h => h >= 3).length / n,
    pWin: r.hits.filter(h => h >= winThreshold).length / n,
    cabezaAtTop: r.cabezaRank.filter(rank => rank <= topN).length / n,
    mrr: n > 0 ? r.cabezaRank.reduce((a, rank) => a + 1 / rank, 0) / n : 0,
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function loadDraws(turno: string): Promise<Draw[]> {
  const { data, error } = await supabase
    .from("draws")
    .select("date,turno,numbers")
    .eq("turno", turno)
    .order("date", { ascending: true })
    .limit(2000)
  if (error) throw new Error(`${turno}: ${error.message}`)
  return (data || []).map(r => ({ fecha: (r as { date: string }).date, turno, numbers: (r as { numbers: number[] }).numbers }))
}

const MODELS = ["random", "freq30", "decay15", "bayes", "v7", "v7_noheat", "v7_oldfreq", "v7_ens", "combo"] as const
type ModelName = (typeof MODELS)[number]

async function evalTurno(turno: string): Promise<void> {
  const isPoceada = turno === "Poceada"
  const topN = isPoceada ? 8 : 10
  const winThreshold = isPoceada ? 5 : 1
  const priorMean = isPoceada ? 0.2 : 0.18

  const draws = await loadDraws(turno)
  if (draws.length < warmup + 20) {
    console.log(`\n⏭  ${turno}: insufficient data (${draws.length})`)
    return
  }

  const results = new Map<ModelName, ModelResult>()
  const init = (): ModelResult => ({ hits: [], cabezaRank: [] })
  for (const m of MODELS) results.set(m, init())

  let expectedTotal = 0
  let expectedVar = 0

  const end = draws.length
  const t0 = Date.now()
  let done = 0
  const totalCutoffs = Math.ceil((end - warmup) / step)

  const rankOf = (full: number[], n: number): number => {
    const i = full.indexOf(n)
    return i >= 0 ? i + 1 : 101
  }

  for (let i = warmup; i < end; i += step) {
    const hist = draws.slice(0, i)
    const target = draws[i]
    const t2c = twoC(target.numbers)
    const K = t2c.size
    const cabeza2 = ((target.numbers[0] % 100) + 100) % 100
    const asOf = target.fecha

    // random baseline (analytic)
    expectedTotal += topN * K / 100
    expectedVar += hypergeomVar(topN, K)

    // ── full rankings (100) de todos los modelos ──
    const full: Partial<Record<ModelName, number[]>> = {}
    full.freq30 = freqModel(hist, 100, 30)
    full.decay15 = freqModel(hist, 100, undefined, 15)
    full.bayes = bayesModel(hist, 100, priorMean)
    full.v7 = predictV7(hist, turno, 100, undefined, undefined, { asOf }).map(p => parseInt(p.numero, 10))
    full.v7_noheat = predictV7(hist, turno, 100, undefined, undefined, { asOf, heat: false }).map(p => parseInt(p.numero, 10))
    full.v7_oldfreq = predictV7(hist, turno, 100, undefined, undefined, { asOf, decayFreq: false }).map(p => parseInt(p.numero, 10))
    if (!noEns) {
      full.v7_ens = (await predictEnsembleV7(hist, turno, 100, undefined, undefined, { asOf })).predictions.map(p => parseInt(p.numero, 10))
    }
    // combo: rank promedio (bayes + decay15 + v7)
    {
      const rankArr = (nums: number[]): number[] => {
        const r = new Array(100)
        nums.forEach((n, idx) => { r[n] = idx + 1 })
        return r
      }
      const rb = rankArr(full.bayes!), rd = rankArr(full.decay15!), rv = rankArr(full.v7!)
      const avg = new Array(100).fill(0)
      for (let n = 0; n < 100; n++) avg[n] = -(rb[n] + rd[n] + rv[n]) / 3
      full.combo = topNFromScores(avg, 100)
    }

    for (const [name, fullRank] of Object.entries(full) as [ModelName, number[]][]) {
      const r = results.get(name)!
      r.hits.push(intersectionCount(fullRank.slice(0, topN), t2c))
      r.cabezaRank.push(rankOf(fullRank, cabeza2))
    }

    done++
    if (done % 100 === 0) {
      process.stdout.write(`  ${turno}: ${done}/${totalCutoffs} (${((Date.now() - t0) / 1000).toFixed(0)}s)\n`)
    }
  }

  // ── Aggregate & report ──
  const n = results.get("v7")!.hits.length
  console.log(`\n═══ ${turno}  (n=${n} test draws, topN=${topN}, ${((Date.now() - t0) / 1000).toFixed(0)}s) ═══`)
  const col3 = isPoceada ? "P>=5(win)" : "P>=3   "
  const col4 = isPoceada ? "" : "cabeza@10"
  const header = `model           meanHits  lift     z     P>=1    ${col3} ${col4}  mrr`
  console.log(header)
  console.log("-".repeat(header.length))

  const randMean = expectedTotal / n
  const rows: Array<{ name: string; agg: Agg | null; z: number; lift: number }> = [
    { name: "random", agg: null, z: 0, lift: 1 },
  ]

  for (const name of MODELS) {
    if (name === "random") continue
    const r = results.get(name)!
    if (r.hits.length === 0) continue
    const totalHits = r.hits.reduce((a, b) => a + b, 0)
    const z = expectedVar > 0 ? (totalHits - expectedTotal) / Math.sqrt(expectedVar) : 0
    rows.push({ name, agg: aggregate(r, topN, winThreshold), z, lift: totalHits / expectedTotal })
  }

  const mrrRandom = (() => { let s = 0; for (let k = 1; k <= 100; k++) s += 1 / k; return s / 100 })()

  for (const row of rows) {
    if (!row.agg) {
      const p1 = isPoceada ? "  --   " : (1 - noHitProb(topN, 20)).toFixed(3)
      const p3 = isPoceada ? binomTail(5, topN, 0.2).toFixed(4) : hyperTail(3, topN, 20).toFixed(3)
      const cab = isPoceada ? "" : (topN / 100).toFixed(3) + "  "
      console.log(`${"random".padEnd(15)} ${randMean.toFixed(4).padStart(8)} ${1 .toFixed(3).padStart(6)} ${"0.0".padStart(5)} ${p1.padStart(7)} ${p3.padStart(8)}  ${cab}${mrrRandom.toFixed(3)}`)
      continue
    }
    const a = row.agg
    const p3 = isPoceada ? a.pWin.toFixed(4).padStart(8) : a.pAtLeast3.toFixed(3).padStart(7)
    const cab = isPoceada ? "" : a.cabezaAtTop.toFixed(3) + "  "
    console.log(
      `${row.name.padEnd(15)} ${a.meanHits.toFixed(4).padStart(8)} ${row.lift.toFixed(3).padStart(6)} ${row.z.toFixed(1).padStart(5)} ${a.pAtLeast1.toFixed(3).padStart(7)} ${p3.padStart(8)}  ${cab}${a.mrr.toFixed(3)}`
    )
  }
}

/** P(no hit) top-N vs K target values (aprox. sin reemplazo sobre distintos) */
function noHitProb(n: number, K: number): number {
  // C(100-K, n) / C(100, n)
  let p = 1
  for (let i = 0; i < n; i++) p *= (100 - K - i) / (100 - i)
  return p
}

function hyperTail(min: number, n: number, K: number): number {
  // P(X >= min) hypergeometric N=100
  const c = (a: number, b: number): number => {
    if (b < 0 || b > a) return 0
    let r = 1
    for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1)
    return r
  }
  const total = c(100, n)
  let s = 0
  for (let k = min; k <= Math.min(n, K); k++) s += (c(K, k) * c(100 - K, n - k)) / total
  return s
}

function binomTail(min: number, n: number, p: number): number {
  const c = (a: number, b: number): number => {
    let r = 1
    for (let i = 0; i < b; i++) r = (r * (a - i)) / (i + 1)
    return r
  }
  let s = 0
  for (let k = min; k <= n; k++) s += c(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k)
  return s
}

async function main() {
  console.log("═══ OOS Walk-Forward Evaluation ═══")
  console.log(`turnos: ${turnosSel.join(", ")} | warmup=${warmup} | step=${step}${noEns ? " | no-ens" : ""}`)
  for (const turno of turnosSel) {
    try {
      await evalTurno(turno)
    } catch (e) {
      console.error(`ERROR ${turno}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  console.log("\nDone.")
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
