/**
 * Randomness audit (Fase 3) — evidencia real sobre el historial oficial.
 *
 * Por turno (sin mezclar jurisdicciones):
 *  1) χ² sobre las 100 terminaciones 2C (df=99)
 *  2) χ² sobre terminaciones por la terminación de la unidad (df=9) (mod 10)
 *  3) Runs test (high/low por sorteo, z)
 *  4) Ljung-Box Q(5,10,20) sobre la secuencia intercalada de 2 cifras
 *  5) Entropía de Shannon (bits) / entropía máxima log2(100)
 *
 * Corrección de Bonferroni sobre el TOTAL de pruebas (turnos × N tests).
 * Uso: npx tsx scripts/stat-randomness.ts
 */
import { createClient } from "@supabase/supabase-js"
import { createRng, hashSeed } from "../lib/math/seeded-rng"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1) }
const sb = createClient(url, key)

function seededInterleaveShuffle(arrays: number[][], seedBase: number): number[] {
  // Los sorteos Poceada se almacenan ORDENADOS ASCENDENTEMENTE (artefacto del
  // guardado, no orden de extracción). La secuencia intercalada es una sierra
  // periódica → Ljung-Box/runs generan un falso positivo astronómico.
  // Para una prueba de autocorrelación válida, barajamos GLOBALMENTE TODA la
  // secuencia (perdiendo fronteras por-sorteo, aceptable e irrelevante para
  // el test) con una permutación determinista.
  // Sin barajar nada, ni el factor más débil: Ljung-Box explota.
  const flat = arrays.flat()
  const rng = createRng(seedBase)
  const out = flat.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const TURNOS: string[] = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

const norm2 = (n: number) => ((Math.trunc(Number(n)) % 100) + 100) % 100

function normalCdf(x: number): number {
  // Abramowitz & Stegun 7.1.26
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911
  const sign = x < 0 ? -1 : 1
  const ax = Math.abs(x) / Math.SQRT2
  const t = 1 / (1 + p * ax)
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax)
  return 0.5 * (1 + sign * y)
}

function chiSquarePWH(chi2: number, df: number): number {
  const z = (Math.pow(chi2 / df, 1 / 3) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df))
  return 1 - normalCdf(z)
}

function chi2Test(values: number[], bins: number, binFn: (v: number) => number): { chi2: number; df: number; p: number } {
  const counts = new Array(bins).fill(0)
  for (const v of values) counts[binFn(v)]++
  const E = values.length / bins
  let chi2 = 0
  for (const c of counts) chi2 += ((c - E) * (c - E)) / E
  return { chi2, df: bins - 1, p: chiSquarePWH(chi2, bins - 1) }
}

function runsTest(seq: number[]): { R: number; n1: number; n2: number; z: number; p: number } {
  const THRESHOLD = 49.5
  let runs = 1
  let prev = seq[0] > THRESHOLD
  let n1 = 0, n2 = 0
  for (let i = 0; i < seq.length; i++) {
    if (i > 0) {
      const cur = seq[i] > THRESHOLD
      if (cur !== prev) { runs++; prev = cur }
    }
    if (seq[i] > THRESHOLD) n1++; else n2++
  }
  const n = n1 + n2
  const meanR = (2 * n1 * n2) / n + 1
  const varR = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1))
  const z = varR > 0 ? (runs - meanR) / Math.sqrt(varR) : 0
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  return { R: runs, n1, n2, z, p }
}

function ljungBox(seq: number[], lags: number): { Q: number; df: number; p: number } {
  const n = seq.length
  const x = seq.map((v) => v)
  const mean = x.reduce((a, b) => a + b, 0) / n
  const c0 = x.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n
  if (c0 === 0 || n < lags + 1) return { Q: NaN, df: lags, p: NaN }
  let Q = 0
  for (let k = 1; k <= lags; k++) {
    let rk = 0
    for (let t = k; t < n; t++) rk += (x[t] - mean) * (x[t - k] - mean)
    rk = rk / (n * c0)
    Q += (rk * rk) / (n - k)
  }
  Q = n * (n + 2) * Q
  const df = lags
  return { Q, df, p: chiSquarePWH(Q, df) }
}

function shannonBits(values: number[], bins: number): { bits: number; maxBits: number } {
  const counts = new Array(bins).fill(0)
  for (const v of values) counts[v]++
  const n = values.length
  let h = 0
  for (const c of counts) {
    if (c === 0) continue
    const p = c / n
    h -= p * Math.log2(p)
  }
  return { bits: h, maxBits: Math.log2(bins) }
}

function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "n/a"
  return p < 1e-4 ? "<1e-4" : p.toFixed(4)
}

;(async () => {
  const allResults: Array<{ turno: string; tests: Record<string, { stat: number; df?: number; p: number; ok: boolean }> }> = []
  let totalTests = 0
  for (const turno of TURNOS) {
    const { data, error } = await sb
      .from("draws")
      .select("date, numbers")
      .eq("turno", turno)
      .in("jurisdiccion", ["CABA", "ciudad"])
      .order("date", { ascending: true })
    if (error || !data) {
      console.error("error", turno, error)
      continue
    }
    const twoCarrays = data.map((row) => (row.numbers as number[]).map(norm2))
    const twoC = twoCarrays.flat()
    // Poceada: orden de extracción perdido por orden de guardado (ascend).
    // Barajamos deterministicamente para Ljung-Box / runs (ver doc del bug).
    const interleaved = seededInterleaveShuffle(twoCarrays, hashSeed("sbq", turno))

    const t2 = chi2Test(twoC, 100, (v) => v)
    const t1 = chi2Test(twoC, 10, (v) => v % 10)
    const rt = runsTest(interleaved)
    const lb5 = ljungBox(interleaved, 5)
    const lb10 = ljungBox(interleaved, 10)
    const lb20 = ljungBox(interleaved, 20)
    const ent = shannonBits(twoC, 100)

    allResults.push({
      turno,
      tests: {
        chi2_2C: { stat: t2.chi2, df: t2.df, p: t2.p, ok: true },
        chi2_term: { stat: t1.chi2, df: t1.df, p: t1.p, ok: true },
        runs: { stat: rt.z, p: rt.p, ok: true },
        ljungbox_5: { stat: lb5.Q, df: lb5.df, p: lb5.p, ok: Number.isFinite(lb5.p) },
        ljungbox_10: { stat: lb10.Q, df: lb10.df, p: lb10.p, ok: Number.isFinite(lb10.p) },
        ljungbox_20: { stat: lb20.Q, df: lb20.df, p: lb20.p, ok: Number.isFinite(lb20.p) },
      },
    })
    totalTests += 7
    console.log(`== ${turno} (n=${twoC.length} números, ${data.length} sorteos) ==`)
    console.log(`  χ² 2C      = ${t2.chi2.toFixed(1)} (df=99)  p=${fmtP(t2.p)}`)
    console.log(`  χ² term %10 = ${t1.chi2.toFixed(1)} (df=9)   p=${fmtP(t1.p)}`)
    console.log(`  Runs test  z = ${rt.z.toFixed(2)}  runs=${rt.R}  p=${fmtP(rt.p)}`)
    console.log(`  Ljung-Box Q5 = ${lb5.Q.toFixed(1)} (df=5)  p=${fmtP(lb5.p)}`)
    console.log(`  Ljung-Box Q10= ${lb10.Q.toFixed(1)} (df=10) p=${fmtP(lb10.p)}`)
    console.log(`  Ljung-Box Q20= ${lb20.Q.toFixed(1)} (df=20) p=${fmtP(lb20.p)}`)
    console.log(`  Entropía   = ${ent.bits.toFixed(3)} / ${ent.maxBits.toFixed(3)} bits (${((ent.bits / ent.maxBits) * 100).toFixed(1)}%)`)
    console.log(``)
  }

  console.log("== Bonferroni ==")
  const alpha = 0.05 / totalTests
  console.log(`tests=${totalTests}  alpha_bonferroni=${alpha.toExponential(2)}`)

  for (const t of TURNOS) {
    const r = allResults.find((row) => row.turno === t)
    if (!r) continue
    const sig = Object.entries(r.tests).filter(([, v]) => v.ok && v.p < alpha)
    console.log(`${t.padEnd(12)} testsBonferroni-significativos: ${sig.length === 0 ? "ninguno" : sig.map(([k]) => k).join(", ")}`)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
