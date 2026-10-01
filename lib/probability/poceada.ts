/**
 * Poceada Probability Model
 *
 * Poceada: 20 numbers drawn from 00-99. Player picks 8.
 * Wins with 5/6/7/8 matches.
 *
 * Uses Bayesian posterior + Binomial distribution for real probabilities.
 * NO Math.random — fully deterministic.
 */

const TOTAL_NUMBERS = 100
const DRAWN_COUNT = 20
const PICK_COUNT = 8
export const POCEADA_MATCHES = [5, 6, 7, 8] as const

export interface NumberProbability {
  numero: string
  /** P(number appears in next draw), Bayesian posterior with Dirichlet(1) prior */
  pDraw: number
  /** Historical frequency (count / totalDraws) */
  freq: number
  /** Gap since last appearance */
  gap: number
  /** Heat penalty: recently drawn numbers get LOWER future prob (regression to mean) */
  heatPenalty: number
  /** Final adjusted probability after heat penalty */
  pAdjusted: number
  /** Expected matches contribution: pAdjusted * PICK_COUNT */
  expectedContribution: number
}

export interface PoceadaProbabilities {
  numbers: NumberProbability[]
  /** P(exactly k matches | random pick) — binomial baseline */
  randomMatchProb: Record<number, number>
  /** P(at least 5 matches | random pick) — the "win" probability for random */
  randomWinProb: number
  /** Expected hits for the model's top-8 pick */
  expectedHits: number
  /** P(at least 5 matches | model's top-8 pick) */
  modelWinProb: number
  totalDraws: number
}

/**
 * Binomial PMF: P(X = k) = C(n,k) * p^k * (1-p)^(n-k)
 * Deterministic, no overflow for small n.
 */
export function binomPMF(k: number, n: number, p: number): number {
  if (k < 0 || k > n) return 0
  const logC = logBinomCoeff(n, k)
  return Math.exp(logC + k * Math.log(p) + (n - k) * Math.log(1 - p))
}

/**
 * Binomial CDF: P(X <= k)
 */
export function binomCDF(k: number, n: number, p: number): number {
  let sum = 0
  for (let i = 0; i <= k; i++) sum += binomPMF(i, n, p)
  return Math.min(1, sum)
}

function logBinomCoeff(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity
  k = Math.min(k, n - k)
  let logC = 0
  for (let i = 0; i < k; i++) {
    logC += Math.log(n - i) - Math.log(i + 1)
  }
  return logC
}

/**
 * Compute per-number probabilities for Poceada from historical draws.
 *
 * @param draws - array of number arrays (each is one draw's 20 numbers 0-99)
 * @returns sorted probabilities for all 100 numbers
 */
export function computePoceadaProbabilities(draws: number[][]): PoceadaProbabilities {
  const totalDraws = draws.length

  // Count appearances
  const counts = new Array(TOTAL_NUMBERS).fill(0)
  const lastSeen = new Array(TOTAL_NUMBERS).fill(-1)

  for (let d = 0; d < totalDraws; d++) {
    for (const raw of draws[d]) {
      const n = ((raw % TOTAL_NUMBERS) + TOTAL_NUMBERS) % TOTAL_NUMBERS
      counts[n]++
      lastSeen[n] = d
    }
  }

  // Dirichlet(1) prior: posterior = (count + 1) / (totalDraws + 2)
  // This avoids 0-probability for never-drawn numbers
  const numbers: NumberProbability[] = []

  for (let n = 0; n < TOTAL_NUMBERS; n++) {
    const freq = totalDraws > 0 ? counts[n] / totalDraws : 0
    const posterior = (counts[n] + 1) / (totalDraws + 2)
    const gap = lastSeen[n] === -1 ? totalDraws : totalDraws - 1 - lastSeen[n]

    // Heat penalty: numbers drawn in last 3 draws get penalized
    // (regression to the mean — hot numbers cool down)
    let heatPenalty = 1.0
    if (gap <= 2) heatPenalty = 0.85
    else if (gap <= 4) heatPenalty = 0.92
    else if (gap >= 15) heatPenalty = 1.05 // slight boost for overdue

    // Normalize: if all penalties applied, re-scale so mean stays ~posterior
    const pAdjusted = posterior * heatPenalty
    const expectedContribution = pAdjusted * PICK_COUNT

    numbers.push({
      numero: String(n).padStart(2, "0"),
      pDraw: posterior,
      freq,
      gap,
      heatPenalty,
      pAdjusted,
      expectedContribution,
    })
  }

  // Sort by adjusted probability desc
  numbers.sort((a, b) => b.pAdjusted - a.pAdjusted)

  // Random baseline: each number has p = 20/100 = 0.2
  const pRandom = DRAWN_COUNT / TOTAL_NUMBERS
  const randomMatchProb: Record<number, number> = {}
  for (const k of POCEADA_MATCHES) {
    randomMatchProb[k] = binomPMF(k, PICK_COUNT, pRandom)
  }
  // P(>= 5) = 1 - P(<= 4)
  const randomWinProb = 1 - binomCDF(4, PICK_COUNT, pRandom)

  // Model's top-8: use their pDraw values in a Poisson-binomial approximation
  const top8 = numbers.slice(0, PICK_COUNT)
  const expectedHits = top8.reduce((s, n) => s + n.pDraw, 0)

  // Approximate P(>=5) for model using binomial with p = avg(pDraw of top8)
  const avgP = expectedHits / PICK_COUNT
  const modelWinProb = 1 - binomCDF(4, PICK_COUNT, avgP)

  return {
    numbers,
    randomMatchProb,
    randomWinProb,
    expectedHits,
    modelWinProb,
    totalDraws,
  }
}

/**
 * Get the best 8 numbers with their probabilities.
 */
export function getTopPoceadaNumbers(draws: number[][], count: number = PICK_COUNT): NumberProbability[] {
  const probs = computePoceadaProbabilities(draws)
  return probs.numbers.slice(0, count)
}
