/**
 * Poceada Federal randomness audit — muestra n=2393 (max potencia real del proyecto).
 *
 * Fuente: poceada_federal_draws (validated). Números guardados ASC (orden de
 * extracción perdido) → tests que usan la secuencia concatenada van con
 * barajado DETERMINISTA (semilla fija) para eliminar el artefacto de formato.
 *
 * Sub-muestras: global, sólo 15:00, sólo 21:00 (Santa Fe/Entre Ríos alternan).
 * Corrección Bonferroni sobre el conjunto de pruebas.
 *
 * Uso: npx tsx scripts/stat-randomness-federal.ts
 */
import { createClient } from "@supabase/supabase-js"
import { createRng, hashSeed } from "../lib/math/seeded-rng"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1) }
const sb = createClient(url, key)

const norm2 = (n: number) => ((Math.trunc(Number(n)) % 100) + 100) % 100

function normalCdf(x: number): number {
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

function seededShuffleFlat(arrays: number[][], seedBase: number): number[] {
  // Los sorteos se guardan ORDENADOS ASCENDENTEMENTE (formato de guardado).
  // La secuencia intercalada es una sierra periódica → Ljung-Box explota
  // por artefacto de FORMATO, no por ruptura de aleatoriedad. Barajamos
  // GLOBALMENTE toda la secuencia (pierde fronteras por-bloque: irrelevante
  // para Ljung-Box / runs; invalida esas pruebas pero desde una línea base
  // honesta, no desde un falso positivo).
  const flat = arrays.flat()
  const rng = createRng(seedBase)
  const out = flat.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function runsTest(seq: number[]): { runs: number; n1: number; n2: number; z: number; p: number } {
  const HI = 50
  let runs = 1
  let prev = seq[0] >= HI
  let n1 = 0, n2 = 0
  for (let i = 0; i < seq.length; i++) {
    if (i > 0) {
      const cur = seq[i] >= HI
      if (cur !== prev) { runs++; prev = cur }
    }
    if (seq[i] >= HI) n1++; else n2++
  }
  const n = n1 + n2
  const meanR = (2 * n1 * n2) / n + 1
  const varR = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1))
  const z = varR > 0 ? (runs - meanR) / Math.sqrt(varR) : 0
  const p = 2 * (1 - normalCdf(Math.abs(z)))
  return { runs, n1, n2, z, p }
}

function ljungBox(seq: number[], lags: number): { Q: number; df: number; p: number } {
  const n = seq.length
  const mean = seq.reduce((a, b) => a + b, 0) / n
  const c0 = seq.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n
  if (c0 === 0 || n < lags + 1) return { Q: NaN, df: lags, p: NaN }
  let Q = 0
  for (let k = 1; k <= lags; k++) {
    let rk = 0
    for (let t = k; t < n; t++) rk += (seq[t] - mean) * (seq[t - k] - mean)
    rk = rk / (n * c0)
    Q += (rk * rk) / (n - k)
  }
  Q = n * (n + 2) * Q
  return { Q, df: lags, p: chiSquarePWH(Q, lags) }
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

const fmtP = (p: number) => (!Number.isFinite(p) ? "n/a" : p < 1e-4 ? "<1e-4" : p.toFixed(4))

interface Dataset { nombre: string; rows: number[][] }

async function runSet(ds: Dataset) {
  const t = console.time(ds.nombre)
  const twoC = ds.rows.flat()
  const flat = seededShuffleFlat(ds.rows, hashSeed("federal-audit", ds.nombre))
  console.log(`== ${ds.nombre} (${twoC.length} números · ${ds.rows.length} sorteos) ==`)

  const t2 = chi2Test(twoC, 100, (v) => v)
  const t1 = chi2Test(twoC, 10, (v) => v % 10)
  const rt = runsTest(flat)
  const lb5 = ljungBox(flat, 5)
  const lb10 = ljungBox(flat, 10)
  const lb20 = ljungBox(flat, 20)
  const ent = shannonBits(twoC, 100)

  console.log(`  χ² 2C      = ${t2.chi2.toFixed(1)} (df=99)  p=${fmtP(t2.p)}`)
  console.log(`  χ² %10     = ${t1.chi2.toFixed(1)} (df=9)   p=${fmtP(t1.p)}`)
  console.log(`  Runs       z = ${rt.z.toFixed(2)}  runs=${rt.runs}  p=${fmtP(rt.p)}`)
  console.log(`  Ljung-Box5  Q = ${Number.isFinite(lb5.Q) ? lb5.Q.toFixed(1) : "n/a"} (df=${lb5.df})  p=${fmtP(lb5.p)}`)
  console.log(`  Ljung-Box10 Q = ${Number.isFinite(lb10.Q) ? lb10.Q.toFixed(1) : "n/a"} (df=${lb10.df})  p=${fmtP(lb10.p)}`)
  console.log(`  Ljung-Box20 Q = ${Number.isFinite(lb20.Q) ? lb20.Q.toFixed(1) : "n/a"} (df=${lb20.df})  p=${fmtP(lb20.p)}`)
  console.log(`  Entropía   = ${ent.bits.toFixed(3)} / ${ent.maxBits.toFixed(3)} bits (${((ent.bits / ent.maxBits) * 100).toFixed(1)}%)`)
  console.log("")
  console.timeEnd(ds.nombre)

  return {
    nombre: ds.nombre, tests: [
      { name: "chi2_2C", p: t2.p },
      { name: "chi2_term", p: t1.p },
      { name: "runs", p: rt.p },
      { name: "ljungbox_5", p: lb5.p },
      { name: "ljungbox_10", p: lb10.p },
      { name: "ljungbox_20", p: lb20.p },
    ],
  }
}

;(async () => {
  const pageSize = 1000
  let allRows: Array<{ concurso: number; fecha: string; hora: string; numeros: number[] }> = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await sb
      .from("poceada_federal_draws")
      .select("concurso,fecha,hora,numeros")
      .eq("estado", "validated")
      .order("fecha", { ascending: true })
      .order("hora", { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    allRows.push(...(data as typeof allRows))
    if (data.length < pageSize) break
  }
  console.log(`filas cargadas: ${allRows.length}`)
  const rows = allRows.map((r) => ((r.numeros as number[]) ?? []).map(norm2))
  const rowsModern = rows.slice(-400)

  const all = await runSet({ nombre: "poceada_federal_todos", rows })
  const mat = await runSet({ nombre: "poceada_federal_15:00", rows: allRows.filter((r) => r.hora === "15:00").map((r) => ((r.numeros as number[]) ?? []).map(norm2)) })
  const noc = await runSet({ nombre: "poceada_federal_21:00", rows: allRows.filter((r) => r.hora === "21:00").map((r) => ((r.numeros as number[]) ?? []).map(norm2)) })
  const modern = await runSet({ nombre: "poceada_federal_ultimos400", rows: rowsModern })

  console.log("== Bonferroni sobre 21 tests ==")
  const allTests = [...all.tests, ...mat.tests, ...noc.tests, ...modern.tests]
  const alpha = 0.05 / allTests.length
  console.log(`alpha_bonferroni = ${alpha.toExponential(2)}\n`)
  for (const t of allTests) {
    if (Number.isFinite(t.p) && t.p < alpha) console.log(`!!! ${t.name} p=${fmtP(t.p)}`)
  }
  console.log("\nSíntomas no corregidos (para registro, NO señal):")
  for (const t of allTests) {
    if (Number.isFinite(t.p) && t.p < 0.05) console.log(`  ${t.name} p=${fmtP(t.p)}`)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
