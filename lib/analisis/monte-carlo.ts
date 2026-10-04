/**
 * Monte Carlo sembrado — capa de estabilidad del top-10.
 *
 * Bootstrap (muestreo CON reemplazo) sobre el histórico del turno usando el
 * PRNG xorshift32 sembrado (mismo día+turno → misma simulación; nunca
 * Math.random, coherente con "nada es al azar"). En cada iteración se
 * recalcula la frecuencia 2-cifras de los 100 números y se observa si cada
 * número del top-10 servido queda dentro del top-10 por frecuencia.
 *
 * Resultado por número:
 *   - p_top10: fracción de iteraciones en que el número queda en el top-10.
 *   - ci90: percentiles 5/95 de su frecuencia relativa (share 2-cifras).
 * Resultado global:
 *   - estabilidad: media de p_top10 sobre el top-10 servido.
 *
 * IMPORTANTE: esto es una capa de ANÁLISIS. No modifica scores ni ranking
 * (no toca OMEGA ni el backtest).
 */

import { createRng } from "@/lib/math/seeded-rng"

export interface MonteCarloNumero {
  /** "43" */
  n: string
  /** Fracción de iteraciones en que el número queda en el top-10 (0..1) */
  p_top10: number
  /** Percentiles 5/95 de su frecuencia relativa (share 2-cifras) */
  ci90: [number, number]
}

export interface MonteCarloResultado {
  iteraciones: number
  metodo: string
  target: string
  seed: number
  estabilidad: number
  numeros: MonteCarloNumero[]
}

interface DrawLike {
  numbers: number[]
}

export const MONTE_CARLO_ITERACIONES = 5000

export function runMonteCarlo(
  draws: DrawLike[],
  top10: number[],
  seed: number,
  iteraciones: number = MONTE_CARLO_ITERACIONES,
): MonteCarloResultado | null {
  if (!Array.isArray(draws) || !Array.isArray(top10) || top10.length === 0) return null

  // Precompute: valores 2-cifras por sorteo
  const pool: number[][] = []
  for (const d of draws) {
    if (!d || !Array.isArray(d.numbers)) continue
    const vals: number[] = []
    for (const raw of d.numbers) {
      const n = ((Math.trunc(Number(raw)) % 100) + 100) % 100
      if (Number.isFinite(n)) vals.push(n)
    }
    if (vals.length > 0) pool.push(vals)
  }
  if (pool.length < 10 || iteraciones < 100) return null

  const idx = top10.map((n) => ((Math.trunc(Number(n)) % 100) + 100) % 100)
  const rng = createRng(seed)
  const N = pool.length

  const freq = new Int32Array(100)
  const order = new Int32Array(100)
  for (let i = 0; i < 100; i++) order[i] = i
  const inTop10 = new Uint8Array(100)
  const memberships = new Float64Array(idx.length)
  const shares: Float32Array[] = idx.map(() => new Float32Array(iteraciones))

  for (let it = 0; it < iteraciones; it++) {
    // 1. Resampleo con reemplazo de N sorteos
    freq.fill(0)
    let total = 0
    for (let s = 0; s < N; s++) {
      const draw = pool[(rng() * N) | 0]
      for (let k = 0; k < draw.length; k++) {
        freq[draw[k]]++
        total++
      }
    }

    // 2. Ranking 00-99 por frecuencia (desc) con desempate determinista (n asc)
    order.sort((a, b) => freq[b] - freq[a] || a - b)
    inTop10.fill(0)
    for (let i = 0; i < 10; i++) inTop10[order[i]] = 1

    // 3. Registrar membresía y share de nuestros números
    for (let j = 0; j < idx.length; j++) {
      const n = idx[j]
      if (inTop10[n]) memberships[j]++
      shares[j][it] = total > 0 ? freq[n] / total : 0
    }
  }

  const round4 = (x: number) => Math.round(x * 10000) / 10000
  const numeros: MonteCarloNumero[] = idx.map((n, j) => {
    const sorted = Array.from(shares[j]).sort((a, b) => a - b)
    const lo = sorted[Math.max(0, Math.floor(0.05 * (sorted.length - 1)))]
    const hi = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * (sorted.length - 1)))]
    return {
      n: String(n).padStart(2, "0"),
      p_top10: round4(memberships[j] / iteraciones),
      ci90: [round4(lo), round4(hi)],
    }
  })

  const estabilidad =
    numeros.length > 0
      ? round4(numeros.reduce((acc, x) => acc + x.p_top10, 0) / numeros.length)
      : 0

  return {
    iteraciones,
    metodo: "bootstrap (muestreo con reemplazo) sobre el histórico",
    target: "estabilidad del top-10 por frecuencia 2-cifras",
    seed,
    estabilidad,
    numeros,
  }
}
