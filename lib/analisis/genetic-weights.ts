/**
 * Optimización de pesos del ensemble.
 * Determinista: PRNG sembrado desde los datos (cero Math.random).
 */

import { createRng, hashSeed } from "@/lib/math/seeded-rng"

export interface GeneticConfig {
  populationSize: number
  generations: number
  mutationRate: number
  crossoverRate: number
  eliteRatio: number
  tournamentSize: number
  fitnessWindow: number
}

export interface Chromosome {
  weights: number[]
  fitness: number
}

export interface GeneticResult {
  optimalWeights: number[]
  bestFitness: number
  generationFitness: number[]
  engineNames: string[]
  convergenceGeneration: number
}

const DEFAULT_CONFIG: GeneticConfig = {
  populationSize: 50,
  generations: 100,
  mutationRate: 0.15,
  crossoverRate: 0.8,
  eliteRatio: 0.1,
  tournamentSize: 5,
  fitnessWindow: 200,
}

export function optimizeWeights(
  enginePredictions: number[][],
  actualNumbers: number[][],
  numEngines: number,
  config: Partial<GeneticConfig> = {},
): GeneticResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const seed = hashSeed(
    numEngines,
    enginePredictions.length,
    actualNumbers.length,
    cfg.populationSize,
    cfg.generations,
  )
  const rng = createRng(seed)

  let population: Chromosome[] = Array.from({ length: cfg.populationSize }, (_, i) => {
    const local = createRng(seed + i * 104729)
    return {
      weights: Array.from({ length: numEngines }, () => local()),
      fitness: 0,
    }
  })
  population.forEach(c => normalizeWeights(c.weights))

  const generationFitness: number[] = []
  let bestEver: Chromosome = { weights: [...population[0].weights], fitness: -Infinity }
  let convergenceGen = cfg.generations

  for (let gen = 0; gen < cfg.generations; gen++) {
    for (const chrom of population) {
      chrom.fitness = evaluateFitness(chrom.weights, enginePredictions, actualNumbers)
    }
    population.sort((a, b) => b.fitness - a.fitness)

    if (population[0].fitness > bestEver.fitness) {
      bestEver = { ...population[0], weights: [...population[0].weights] }
      convergenceGen = gen
    }
    generationFitness.push(population[0].fitness)

    if (gen > 20) {
      const recent = generationFitness.slice(-20)
      if (Math.max(...recent) - Math.min(...recent) < 0.001) break
    }

    const newPopulation: Chromosome[] = []
    const eliteCount = Math.max(1, Math.floor(cfg.eliteRatio * cfg.populationSize))
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push({ ...population[i], weights: [...population[i].weights] })
    }

    while (newPopulation.length < cfg.populationSize) {
      const parent1 = tournamentSelect(population, cfg.tournamentSize, rng)
      const parent2 = tournamentSelect(population, cfg.tournamentSize, rng)
      let child: Chromosome
      if (rng() < cfg.crossoverRate) {
        child = crossover(parent1, parent2, rng)
      } else {
        child = {
          weights: [...(rng() < 0.5 ? parent1 : parent2).weights],
          fitness: 0,
        }
      }
      mutate(child, cfg.mutationRate, rng)
      normalizeWeights(child.weights)
      newPopulation.push(child)
    }
    population = newPopulation
  }

  return {
    optimalWeights: bestEver.weights,
    bestFitness: bestEver.fitness,
    generationFitness,
    engineNames: enginePredictions.map((_, i) => `engine_${i}`),
    convergenceGeneration: convergenceGen,
  }
}

function evaluateFitness(
  weights: number[],
  enginePredictions: number[][],
  actualNumbers: number[][],
): number {
  const numEngines = weights.length
  const n = enginePredictions[0]?.length ?? 100
  let score = 0
  let total = 0
  const window = Math.min(actualNumbers.length, 200)
  const recentActual = actualNumbers.slice(0, window)

  for (const actual of recentActual) {
    const ensemble = new Array(n).fill(0)
    for (let e = 0; e < numEngines; e++) {
      const engine = enginePredictions[e] ?? new Array(n).fill(0)
      for (let j = 0; j < n; j++) {
        ensemble[j] += weights[e] * (engine[j] ?? 0)
      }
    }
    const ranked = ensemble
      .map((s, i) => ({ score: s, idx: i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(r => r.idx)

    for (const num of actual) {
      if (ranked.includes(num % 100)) score += 1
      total += 1
    }
  }
  return total > 0 ? score / total : 0
}

function tournamentSelect(
  population: Chromosome[],
  size: number,
  rng: () => number,
): Chromosome {
  let best: Chromosome | null = null
  for (let i = 0; i < size; i++) {
    const idx = Math.floor(rng() * population.length)
    if (!best || population[idx].fitness > best.fitness) best = population[idx]
  }
  return best!
}

function crossover(a: Chromosome, b: Chromosome, rng: () => number): Chromosome {
  return {
    weights: a.weights.map((w, i) => {
      if (rng() < 0.5) return w
      const min = Math.min(w, b.weights[i])
      const max = Math.max(w, b.weights[i])
      const range = max - min
      return min + rng() * range * 1.5
    }),
    fitness: 0,
  }
}

function mutate(chrom: Chromosome, rate: number, rng: () => number): void {
  for (let i = 0; i < chrom.weights.length; i++) {
    if (rng() < rate) {
      chrom.weights[i] += gaussian(rng) * 0.3
      chrom.weights[i] = Math.max(0, chrom.weights[i])
    }
  }
}

function normalizeWeights(weights: number[]): void {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum > 0) {
    for (let i = 0; i < weights.length; i++) weights[i] = Math.max(0, weights[i]) / sum
  } else {
    weights.fill(1 / weights.length)
  }
}

function gaussian(rng: () => number): number {
  const u1 = Math.max(1e-12, rng())
  const u2 = rng()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
