/**
 * Grid de hiperparámetros para el motor bayesiano de redoblona, evaluación OOS.
 * 9 combinaciones (3 lambda × 3 prior) × 3 turnos representativos.
 * Objetivo: responder si ALGUNA combinación sobrepasa al azar de forma robusta.
 * Uso: npx tsx scripts/redoblonas-bayes-grid.ts
 */
import { createClient } from "@supabase/supabase-js"
import { createRng, hashSeed } from "../lib/math/seeded-rng"
import { seleccionarAnchorsBayes } from "../lib/analisis/redoblonas-bayes"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) { console.error("Falta SUPABASE_SERVICE_ROLE_KEY"); process.exit(1) }
const sb = createClient(url, key)

const TURNOS = ["Previa", "Matutina", "Nocturna"]
const LAMBDAS = [0.003, 0.004, 0.006]
const PRIORS = [150, 250, 400]
const PLAN = [[0,1],[0,2],[1,3],[1,0],[2,3]] as const

const norm2 = (n: number) => ((Math.trunc(Number(n)) % 100) + 100) % 100

function planCompletos(a: number[], s: Set<number>): number {
  let c = 0
  for (const [i, j] of PLAN) if (s.has(a[i]) && s.has(a[j])) c++
  return c
}

;(async () => {
  for (const turno of TURNOS) {
    const { data } = await sb
      .from("draws")
      .select("date, numbers")
      .eq("turno", turno)
      .in("jurisdiccion", ["CABA", "ciudad"])
      .order("date", { ascending: true })
    if (!data) continue
    const sorteos = data.map((r) => (r.numbers as number[]).map(norm2).map((n) => String(n).padStart(2, "0")))
    const n = sorteos.length
    const trainOffset = Math.min(250, Math.floor(n * 0.5))

    // Placebo: mismo fold, anchors aleatorios — promedio 100 muestras
    // Medido una vez por fold (no depende del modelo)
    const placeboCompletos = new Array(n).fill(0)
    const placeboGem1 = new Array(n).fill(0)
    for (let t = trainOffset; t < n; t++) {
      const actualSet = new Set<number>(sorteos[t].map((s) => Number.parseInt(s, 10)))
      let sum = 0, ge1 = 0
      for (let it = 0; it < 100; it++) {
        const rng = createRng((hashSeed(turno, t, "placebo") ^ (it + 1)) >>> 0 || 1)
        const heap = new Set<number>()
        while (heap.size < 4) heap.add(Math.floor(rng() * 100))
        const cp = planCompletos([...heap], actualSet)
        sum += cp
        if (cp >= 1) ge1++
      }
      placeboCompletos[t] = sum / 100
      placeboGem1[t] = ge1 / 100
    }

    console.log(`\n=== ${turno} (${n} sorteos, folds=${n - trainOffset}) ===`)
    console.log("lambda  prior  meanCompl  P(1+) modelo  placebo  dif pts")
    for (const lambdaDecay of LAMBDAS) {
      for (const fuerzaPrior of PRIORS) {
        const completos: number[] = []
        let ge1 = 0
        for (let t = trainOffset; t < n; t++) {
          const anchorsObj = seleccionarAnchorsBayes(sorteos, t, { lambdaDecay, fuerzaPrior, pesoCoocurrencia: 0.15 })
          const anchors = [
            Number.parseInt(anchorsObj.A.numero, 10),
            Number.parseInt(anchorsObj.B.numero, 10),
            Number.parseInt(anchorsObj.C.numero, 10),
            Number.parseInt(anchorsObj.D.numero, 10),
          ]
          const actualSet = new Set<number>(sorteos[t].map((s) => Number.parseInt(s, 10)))
          const cp = planCompletos(anchors, actualSet)
          completos.push(cp)
          if (cp >= 1) ge1++
        }
        const mean = completos.reduce((a, b) => a + b, 0) / completos.length
        const pge1 = ge1 / completos.length
        const pPlaceboCompl = placeboCompletos.slice(trainOffset).reduce((a, b) => a + b, 0) / (n - trainOffset)
        const pPlaceboGem1 = placeboGem1.slice(trainOffset).reduce((a, b) => a + b, 0) / (n - trainOffset)
        const diff = (pge1 - pPlaceboGem1) * 100
        console.log(`${lambdaDecay.toFixed(3)}   ${fuerzaPrior}   ${mean.toFixed(3)}      ${(pge1 * 100).toFixed(2)}%      ${(pPlaceboGem1 * 100).toFixed(2)}%    ${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`)
      }
    }
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
