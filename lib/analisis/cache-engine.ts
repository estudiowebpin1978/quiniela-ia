/**
 * PRE-CALCULATED CACHE ENGINE
 *
 * Caches feature vectors and multi-level scores for all 10,000 numbers (0000-9999).
 * Supports incremental updates when new draws arrive.
 */

import { computeFeatureMatrix, getFeatureNames, type FeatureVector } from './features-100'

export interface NumberCache {
  number: number
  features: Record<string, number>
  score2D: number
  score3D: number
  score4D: number
  scorePositions: number
  scoreMarkov: number
  scoreCooccurrence: number
  scoreCombined: number
  lastUpdated: string
}

export interface CacheEngine {
  numbers: NumberCache[]
  computedAt: string
  drawCount: number
  version: string
}

const CACHE_VERSION = '1.0.0'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function pad4(n: number): string {
  return n.toString().padStart(4, '0')
}

function last2(n: number): string {
  return pad4(n).slice(-2)
}

function last3(n: number): string {
  return pad4(n).slice(-3)
}

function extractDigits(n: number): [number, number, number, number] {
  const s = pad4(n)
  return [parseInt(s[0]), parseInt(s[1]), parseInt(s[2]), parseInt(s[3])]
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  let s = 0
  for (const v of arr) s += v
  return s / arr.length
}

function normalizeArray(arr: number[]): number[] {
  if (arr.length === 0) return []
  let min = Infinity
  let max = -Infinity
  for (const v of arr) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const range = max - min
  if (range === 0) return arr.map(() => 0.5)
  return arr.map(v => (v - min) / range)
}

// ---------------------------------------------------------------------------
// Multi-level frequency scoring (2D, 3D, 4D)
// ---------------------------------------------------------------------------

function buildFreqMap(sequences: number[][], extractor: (n: number) => string): Map<string, number> {
  const freq = new Map<string, number>()
  let total = 0
  for (const seq of sequences) {
    for (const num of seq) {
      const key = extractor(num)
      freq.set(key, (freq.get(key) || 0) + 1)
      total++
    }
  }
  if (total > 0) {
    for (const [k, v] of Array.from(freq.entries())) freq.set(k, v / total)
  }
  return freq
}

function score2D(sequences: number[][]): number[] {
  const freq = buildFreqMap(sequences, n => last2(n))
  const scores = new Array(10000)
  for (let i = 0; i < 10000; i++) {
    scores[i] = freq.get(last2(i)) || 0
  }
  return normalizeArray(scores)
}

function score3D(sequences: number[][]): number[] {
  const freq = buildFreqMap(sequences, n => last3(n))
  const scores = new Array(10000)
  for (let i = 0; i < 10000; i++) {
    scores[i] = freq.get(last3(i)) || 0
  }
  return normalizeArray(scores)
}

function score4D(sequences: number[][]): number[] {
  const freq = buildFreqMap(sequences, n => pad4(n))
  const scores = new Array(10000)
  for (let i = 0; i < 10000; i++) {
    scores[i] = freq.get(pad4(i)) || 0
  }
  return normalizeArray(scores)
}

// ---------------------------------------------------------------------------
// Position-based scoring
// ---------------------------------------------------------------------------

function scorePositions(sequences: number[][]): number[] {
  const posFreq = {
    miles: new Array(10).fill(0),
    centenas: new Array(10).fill(0),
    decenas: new Array(10).fill(0),
    unidades: new Array(10).fill(0),
  }
  let total = 0

  for (const seq of sequences) {
    for (const num of seq) {
      const d = extractDigits(num)
      posFreq.miles[d[0]]++
      posFreq.centenas[d[1]]++
      posFreq.decenas[d[2]]++
      posFreq.unidades[d[3]]++
      total++
    }
  }

  if (total > 0) {
    for (let i = 0; i < 10; i++) {
      posFreq.miles[i] /= total
      posFreq.centenas[i] /= total
      posFreq.decenas[i] /= total
      posFreq.unidades[i] /= total
    }
  }

  const scores = new Array(10000)
  for (let n = 0; n < 10000; n++) {
    const d = extractDigits(n)
    scores[n] = (posFreq.miles[d[0]] + posFreq.centenas[d[1]] + posFreq.decenas[d[2]] + posFreq.unidades[d[3]]) / 4
  }
  return normalizeArray(scores)
}

// ---------------------------------------------------------------------------
// Markov transition scoring (based on 2D states)
// ---------------------------------------------------------------------------

function scoreMarkov(sequences: number[][]): number[] {
  if (sequences.length < 2) return new Array(10000).fill(0)

  const matrix = Array.from({ length: 100 }, () => new Array(100).fill(0))
  for (let i = 1; i < sequences.length; i++) {
    for (const prev of sequences[i - 1]) {
      for (const curr of sequences[i]) {
        matrix[prev % 100][curr % 100]++
      }
    }
  }

  const lastNums = sequences[sequences.length - 1]
  const scores = new Array(10000).fill(0)

  for (const prev of lastNums) {
    const row = matrix[prev % 100]
    const rowTotal = row.reduce((a: number, b: number) => a + b, 0)
    if (rowTotal > 0) {
      for (let j = 0; j < 100; j++) {
        const prob = row[j] / rowTotal
        for (let k = 0; k < 10000; k++) {
          if (k % 100 === j) scores[k] += prob
        }
      }
    }
  }

  scores.forEach((_, i) => { scores[i] /= lastNums.length || 1 })
  return normalizeArray(scores)
}

// ---------------------------------------------------------------------------
// Co-occurrence scoring (which numbers appear together)
// ---------------------------------------------------------------------------

function scoreCooccurrence(sequences: number[][]): number[] {
  const coocCount = new Map<number, Map<number, number>>()

  for (const seq of sequences) {
    const nums2d = seq.map(n => n % 100)
    for (let a = 0; a < nums2d.length; a++) {
      for (let b = a + 1; b < nums2d.length; b++) {
        const x = nums2d[a]
        const y = nums2d[b]
        if (!coocCount.has(x)) coocCount.set(x, new Map())
        if (!coocCount.has(y)) coocCount.set(y, new Map())
        coocCount.get(x)!.set(y, (coocCount.get(x)!.get(y) || 0) + 1)
        coocCount.get(y)!.set(x, (coocCount.get(y)!.get(x) || 0) + 1)
      }
    }
  }

  const lastNums = sequences[sequences.length - 1].map(n => n % 100)
  const scores = new Array(10000).fill(0)

  for (let target = 0; target < 100; target++) {
    let totalScore = 0
    for (const drawn of lastNums) {
      const cooc = coocCount.get(drawn)
      if (cooc && cooc.has(target)) {
        totalScore += cooc.get(target)!
      }
    }
    for (let k = 0; k < 10000; k++) {
      if (k % 100 === target) scores[k] = totalScore
    }
  }

  return normalizeArray(scores)
}

// ---------------------------------------------------------------------------
// Build the complete cache
// ---------------------------------------------------------------------------

export function buildCache(sequences: number[][]): CacheEngine {
  const featureMatrix = computeFeatureMatrix(sequences)
  const s2d = score2D(sequences)
  const s3d = score3D(sequences)
  const s4d = score4D(sequences)
  const sPos = scorePositions(sequences)
  const sMarkov = scoreMarkov(sequences)
  const sCooc = scoreCooccurrence(sequences)

  const weights = { w2d: 0.30, w3d: 0.20, w4d: 0.10, wPos: 0.10, wMarkov: 0.15, wCooc: 0.15 }

  const numbers: NumberCache[] = []

  for (let n = 0; n < 10000; n++) {
    const fv = featureMatrix.vectors.find(v => v.number === (n % 100))
    const features = fv ? { ...fv.features } : {}

    const combined =
      weights.w2d * s2d[n] +
      weights.w3d * s3d[n] +
      weights.w4d * s4d[n] +
      weights.wPos * sPos[n] +
      weights.wMarkov * sMarkov[n] +
      weights.wCooc * sCooc[n]

    numbers.push({
      number: n,
      features,
      score2D: s2d[n],
      score3D: s3d[n],
      score4D: s4d[n],
      scorePositions: sPos[n],
      scoreMarkov: sMarkov[n],
      scoreCooccurrence: sCooc[n],
      scoreCombined: combined,
      lastUpdated: new Date().toISOString(),
    })
  }

  numbers.sort((a, b) => b.scoreCombined - a.scoreCombined)

  return {
    numbers,
    computedAt: new Date().toISOString(),
    drawCount: sequences.length,
    version: CACHE_VERSION,
  }
}

// ---------------------------------------------------------------------------
// Query top N from cache
// ---------------------------------------------------------------------------

export function queryCache(cache: CacheEngine, topN: number): NumberCache[] {
  return cache.numbers.slice(0, topN)
}

// ---------------------------------------------------------------------------
// Incremental update when a new draw arrives
// ---------------------------------------------------------------------------

export function updateCache(
  cache: CacheEngine,
  newDraw: number[],
  sequences: number[][]
): CacheEngine {
  const freshCache = buildCache(sequences)
  return freshCache
}
