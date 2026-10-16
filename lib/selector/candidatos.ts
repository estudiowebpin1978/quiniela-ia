/**
 * Candidatos evaluables del meta-selector — puros, sin I/O.
 *
 * Reutiliza OMEGA V7 (`lib/analisis/engine-v7.ts`, firma intacta) y replica
 * los baselines canónicos de `scripts/oos-eval.ts` (frecuencia/recencia/bayes),
 * que no se pueden importar de ahí porque el script ejecuta `main()` al
 * importarse. Los motores V6 (SQL) y ML (modelos serializados) se inyectan
 * desde el runner con su mecanismo anti-fuga nativo (`p_date` / historial de
 * corte) — este módulo jamás hace red.
 *
 * Todos los rankings devuelven los 100 números (00-99) ordenados de mejor a
 * peor; los ceros iniciales se conservan al presentar.
 */

import { predictV7, predictEnsembleV7, type Draw } from "@/lib/analisis/engine-v7"
import type { CandidatoSelector, CorteContexto, SorteoSelector } from "./tipos"

/** 2-cifras canónicas: ((n % 100) + 100) % 100 — conserva 00..99. */
export function dosCifras(n: number): number {
  return ((n % 100) + 100) % 100
}

/** Ranking completo (100) a partir de scores por número: desc, empate por valor. */
export function rankingDesdeScores(scores: number[]): number[] {
  const idx = scores.map((s, i) => [s, i] as [number, number])
  idx.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  return idx.map((x) => x[1])
}

function aDraws(sorteos: SorteoSelector[]): Draw[] {
  return sorteos.map((s) => ({ fecha: s.fecha, turno: s.turno, numbers: s.numbers }))
}

/** Frecuencia histórica (ventana fija, por defecto 30 sorteos). */
export function rankingFrecuencia(
  historial: SorteoSelector[],
  ventana = 30
): number[] {
  const c = new Array(100).fill(0)
  const src = historial.slice(-ventana)
  for (const d of src) for (const n of d.numbers) c[dosCifras(n)]++
  return rankingDesdeScores(c)
}

/** Recencia exponencial (media vida en sorteos, por defecto 15). */
export function rankingRecencia(
  historial: SorteoSelector[],
  halfLife = 15
): number[] {
  const lambda = Math.LN2 / halfLife
  const c = new Array(100).fill(0)
  const n = historial.length
  for (let i = 0; i < n; i++) {
    const w = Math.exp(-lambda * (n - 1 - i))
    for (const num of historial[i].numbers) c[dosCifras(num)] += w
  }
  return rankingDesdeScores(c)
}

/**
 * Bayes Beta-Binomial (frecuencia + prior uniforme con fuerza fija):
 * suaviza muestras chicas hacia la probabilidad a priori.
 */
export function rankingBayes(
  historial: SorteoSelector[],
  priorMean = 0.18,
  fuerza = 20
): number[] {
  const hits = new Array(100).fill(0)
  for (const d of historial) for (const n of d.numbers) hits[dosCifras(n)]++
  const a = fuerza * priorMean
  const b = fuerza * (1 - priorMean)
  const p = new Array(100)
  for (let i = 0; i < 100; i++) p[i] = (hits[i] + a) / (historial.length + a + b)
  return rankingDesdeScores(p)
}

/** OMEGA V7 (motor existente, firma intacta) con corte "asOf" anti-fuga. */
export function rankingV7(ctx: CorteContexto, topN = 100): number[] {
  return predictV7(aDraws(ctx.historial), ctx.turno, topN, undefined, undefined, {
    asOf: ctx.asOf,
  }).map((p) => parseInt(p.numero, 10))
}

/** Ensamble de configuraciones de V7 (`predictEnsembleV7`, motor existente). */
export async function rankingV7Ens(ctx: CorteContexto, topN = 100): Promise<number[]> {
  const r = await predictEnsembleV7(aDraws(ctx.historial), ctx.turno, topN, undefined, undefined, {
    asOf: ctx.asOf,
  })
  return r.predictions.map((p) => parseInt(p.numero, 10))
}

/** Rank promedio de bayes + recencia + V7 (candidato compuesto tipo "combo"). */
export function rankingCombo(
  baselines: { bayes: number[]; recencia: number[]; v7: number[] }
): number[] {
  const rankArr = (nums: number[]): number[] => {
    const r = new Array(100)
    nums.forEach((n, idx) => {
      r[n] = idx + 1
    })
    return r
  }
  const rb = rankArr(baselines.bayes)
  const rd = rankArr(baselines.recencia)
  const rv = rankArr(baselines.v7)
  const avg = new Array(100).fill(0)
  for (let n = 0; n < 100; n++) avg[n] = -(rb[n] + rd[n] + rv[n]) / 3
  return rankingDesdeScores(avg)
}

/** Resuelve el ranking de un candidato (soporta evaluadores async). */
export async function resolverRanking(
  candidato: CandidatoSelector,
  ctx: CorteContexto
): Promise<number[]> {
  return candidato.evaluar(ctx)
}

/**
 * Conjunto base de candidatos puros (sin I/O). V6 y ML NO están acá: se
 * inyectan desde el runner porque requieren Supabase (`fuente: "inyectado"`),
 * conservando su mecanismo anti-fuga nativo (`p_date` / historial de corte).
 */
export function candidatosBase(): CandidatoSelector[] {
  return [
    {
      nombre: "frecuencia",
      fuente: "puro",
      evaluar: (ctx) => rankingFrecuencia(ctx.historial),
    },
    {
      nombre: "recencia",
      fuente: "puro",
      evaluar: (ctx) => rankingRecencia(ctx.historial),
    },
    {
      nombre: "bayes",
      fuente: "puro",
      evaluar: (ctx) => rankingBayes(ctx.historial),
    },
    {
      nombre: "v7",
      fuente: "motor_existente",
      evaluar: (ctx) => rankingV7(ctx),
    },
    {
      nombre: "v7_ens",
      fuente: "motor_existente",
      evaluar: (ctx) => rankingV7Ens(ctx),
    },
    {
      nombre: "combo",
      fuente: "puro",
      evaluar: (ctx) =>
        rankingCombo({
          bayes: rankingBayes(ctx.historial),
          recencia: rankingRecencia(ctx.historial),
          v7: rankingV7(ctx),
        }),
    },
  ]
}
