/**
 * Walk-forward OOS del motor bayesiano de redoblonas vs azar.
 * Por turno (sin mezclar juegos): entrena con sorteos ANTERIORES al objetivo
 * y evalúa las 4 anclas del plan (top-4 del recomendador calibrado) contra
 * la extracción real mod-100 del objetivo. Placebo por fold: 100 anchors
 * aleatorios distintos con semilla determinista.
 *
 * Uso: npx tsx scripts/redoblonas-bayes-backtest.ts
 */
import { createClient } from "@supabase/supabase-js"
import { createRng, hashSeed } from "../lib/math/seeded-rng"
import { seleccionarAnchorsBayes } from "../lib/analisis/redoblonas-bayes"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1) }
const sb = createClient(url, key)

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

const PLAN = [
  [0, 1],
  [0, 2],
  [1, 3],
  [1, 0],
  [2, 3],
] as const

const norm2 = (n: number) => ((Math.trunc(Number(n)) % 100) + 100) % 100

function planCompletos(anchors: number[], setNums: Set<number>): number {
  let c = 0
  for (const [i, j] of PLAN) {
    if (setNums.has(anchors[i]) && setNums.has(anchors[j])) c++
  }
  return c
}

const LAMBDAS = [0.003, 0.004, 0.006]
const PRIORS = [150, 250, 400]

;(async () => {
  const resumen: Array<{ turno: string; folds: number; meanModelo: number; meanPlacebo: number; pge1_modelo: number; pge1_placebo: number }> = []

  for (const turno of TURNOS) {
    const { data, error } = await sb
      .from("draws")
      .select("date, numbers")
      .eq("turno", turno)
      .in("jurisdiccion", ["CABA", "ciudad"])
      .order("date", { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) continue

    const sorteos = data.map((row) => (row.numbers as number[]).map(norm2).map((n) => String(n).padStart(2, "0")))
    const n = sorteos.length
    const trainOffset = Math.min(250, Math.floor(n * 0.5))
    const folds: number[] = []
    let placeboP = 0

    for (let t = trainOffset; t < n; t++) {
      // Modelo calibrado con el historial t-1 (nunca ve el futuro)
      const anchorsObj = seleccionarAnchorsBayes(sorteos, t, { lambdaDecay: 0.004, fuerzaPrior: 250, pesoCoocurrencia: 0.15 })
      const anchors = [
        Number.parseInt(anchorsObj.A.numero, 10),
        Number.parseInt(anchorsObj.B.numero, 10),
        Number.parseInt(anchorsObj.C.numero, 10),
        Number.parseInt(anchorsObj.D.numero, 10),
      ]
      const actualSet = new Set<number>(sorteos[t].map((s) => Number.parseInt(s, 10)))
      const completos = planCompletos(anchors, actualSet)
      folds.push(completos)

      // Placebo
      let pSum = 0
      for (let it = 0; it < 100; it++) {
        const rng = createRng((hashSeed(turno, t) ^ (it + 1)) >>> 0 || 1)
        const heap = new Set<number>()
        while (heap.size < 4) heap.add(Math.floor(rng() * 100))
        const a = [...heap]
        pSum += planCompletos(a, actualSet)
      }
      placeboP += pSum / 100
    }

    const mean = folds.reduce((a, b) => a + b, 0) / folds.length
    const meanPlacebo = placeboP / folds.length
    const pge1 = folds.filter((x) => x >= 1).length / folds.length
    let placeboGem1Sum = 0
    for (let t = trainOffset; t < n; t++) {
      const actualSet = new Set<number>(sorteos[t].map((s) => Number.parseInt(s, 10)))
      let gmin = 0
      for (let it = 0; it < 100; it++) {
        const rng = createRng((hashSeed(turno, t) ^ (it + 1)) >>> 0 || 1)
        const heap = new Set<number>()
        while (heap.size < 4) heap.add(Math.floor(rng() * 100))
        if (planCompletos([...heap], actualSet) >= 1) gmin++
      }
      placeboGem1Sum += gmin
    }
    const placeboGem1 = placeboGem1Sum / (folds.length * 100)
    resumen.push({ turno, folds: folds.length, meanModelo: mean, meanPlacebo, pge1_modelo: pge1, pge1_placebo: placeboGem1 })
    console.log(`== ${turno} (folds=${folds.length}) ==`)
    console.log(`  modelo:  meanCompletos=${mean.toFixed(3)}  P(>=1)=${(pge1 * 100).toFixed(2)}%`)
    console.log(`  placebo: meanCompletos=${meanPlacebo.toFixed(3)}  P(>=1)=${(placeboGem1 * 100).toFixed(2)}%`)
    console.log(``)
  }

  console.log("== Resumen ==")
  for (const r of resumen) {
    const diff = ((r.pge1_modelo - r.pge1_placebo) * 100).toFixed(2)
    console.log(`${r.turno.padEnd(12)} folds=${String(r.folds).padEnd(4)} modelo=${(r.pge1_modelo * 100).toFixed(2)}% placebo=${(r.pge1_placebo * 100).toFixed(2)}% diff=${diff}pts`)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
