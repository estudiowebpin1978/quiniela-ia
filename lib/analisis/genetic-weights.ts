/**
 * Genetic Algorithm for Ensemble Weight Optimization
 * 
 * Evolutionary algorithm that evolves weight configurations for the
 * multi-engine prediction ensemble. Uses historical draw data as the
 * fitness environment to find optimal weight combinations.
 * 
 * Población Inicial → Evaluar contra Histórico → Selección y Cruce → Mutación → Pesos Óptimos
 */

export interface GeneticConfig {
  populationSize: number
  generations: number
  mutationRate: number
  crossoverRate: number
  eliteRatio: number
  tournamentSize: number
  fitnessWindow: number   // Number of recent draws to evaluate against
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
  fitnessWindow: 200
}

/**
 * Run genetic algorithm to optimize ensemble weights.
 * 
 * @param enginePredictions - Array of engine prediction arrays. Each engine returns
 *   an array of 100 scores (one per number). engines[i][j] = engine i's score for number j.
 * @param actualNumbers - Historical actual numbers for fitness evaluation.
 * @param numEngines - Number of engines to optimize weights for.
 * @param config - GA configuration parameters.
 */
export function optimizeWeights(
  enginePredictions: number[][],
  actualNumbers: number[][],
  numEngines: number,
  config: Partial<GeneticConfig> = {}
): GeneticResult {
  const cfg = { ...DEFAULT_CONFIG, ...config }

  // Initialize population: each chromosome has `numEngines` weights
  let population: Chromosome[] = Array.from({ length: cfg.populationSize }, () => ({
    weights: Array.from({ length: numEngines }, () => Math.random()),
    fitness: 0
  }))

  // Normalize initial weights
  population.forEach(c => normalizeWeights(c.weights))

  const generationFitness: number[] = []
  let bestEver: Chromosome = { weights: population[0].weights, fitness: -Infinity }
  let convergenceGen = cfg.generations

  for (let gen = 0; gen < cfg.generations; gen++) {
    // Evaluate fitness for each chromosome
    for (const chrom of population) {
      chrom.fitness = evaluateFitness(chrom.weights, enginePredictions, actualNumbers)
    }

    // Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness)

    // Track best
    if (population[0].fitness > bestEver.fitness) {
      bestEver = { ...population[0], weights: [...population[0].weights] }
      convergenceGen = gen
    }

    generationFitness.push(population[0].fitness)

    // Early stop if converged (fitness hasn't improved in 20 generations)
    if (gen > 20) {
      const recent = generationFitness.slice(-20)
      const maxRecent = Math.max(...recent)
      const minRecent = Math.min(...recent)
      if (maxRecent - minRecent < 0.001) break
    }

    // Selection + crossover + mutation for next generation
    const newPopulation: Chromosome[] = []

    // Elitism: keep top N
    const eliteCount = Math.max(1, Math.floor(cfg.eliteRatio * cfg.populationSize))
    for (let i = 0; i < eliteCount; i++) {
      newPopulation.push({ ...population[i], weights: [...population[i].weights] })
    }

    // Fill rest with crossover + mutation
    while (newPopulation.length < cfg.populationSize) {
      const parent1 = tournamentSelect(population, cfg.tournamentSize)
      const parent2 = tournamentSelect(population, cfg.tournamentSize)

      let child: Chromosome
      if (Math.random() < cfg.crossoverRate) {
        child = crossover(parent1, parent2)
      } else {
        child = {
          weights: [...(Math.random() < 0.5 ? parent1 : parent2).weights],
          fitness: 0
        }
      }

      // Mutation
      mutate(child, cfg.mutationRate)
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
    convergenceGeneration: convergenceGen
  }
}

/**
 * Evaluate fitness: how many numbers would have been in the top-K predictions.
 */
function evaluateFitness(
  weights: number[],
  enginePredictions: number[][],
  actualNumbers: number[][]
): number {
  const numEngines = weights.length
  const n = enginePredictions[0]?.length ?? 100
  let score = 0
  let total = 0

  // Use last `fitnessWindow` draws
  const window = Math.min(actualNumbers.length, 200)
  const recentActual = actualNumbers.slice(0, window)

  for (const actual of recentActual) {
    // Compute weighted ensemble scores
    const ensemble = new Array(n).fill(0)
    for (let e = 0; e < numEngines; e++) {
      const engine = enginePredictions[e] ?? new Array(n).fill(0)
      for (let j = 0; j < n; j++) {
        ensemble[j] += weights[e] * (engine[j] ?? 0)
      }
    }

    // Get top-10 predicted numbers
    const ranked = ensemble
      .map((s, i) => ({ score: s, idx: i }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map(r => r.idx)

    // Check how many actual numbers are in top-10
    for (const num of actual) {
      const t = num % 100
      if (ranked.includes(t)) {
        score += 1
      }
      total += 1
    }
  }

  return total > 0 ? score / total : 0
}

/**
 * Tournament selection: pick best from random subset.
 */
function tournamentSelect(population: Chromosome[], size: number): Chromosome {
  let best: Chromosome | null = null
  for (let i = 0; i < size; i++) {
    const idx = Math.floor(Math.random() * population.length)
    if (!best || population[idx].fitness > best.fitness) {
      best = population[idx]
    }
  }
  return best!
}

/**
 * Uniform crossover: blend weights from two parents.
 */
function crossover(a: Chromosome, b: Chromosome): Chromosome {
  const child: Chromosome = {
    weights: a.weights.map((w, i) => {
      // Blend: 50% chance of taking one parent, otherwise blend
      if (Math.random() < 0.5) return w
      // BLX-alpha crossover (alpha=0.5)
      const min = Math.min(w, b.weights[i])
      const max = Math.max(w, b.weights[i])
      const range = max - min
      return min + Math.random() * range * 1.5
    }),
    fitness: 0
  }
  return child
}

/**
 * Gaussian mutation: perturb weights slightly.
 */
function mutate(chrom: Chromosome, rate: number): void {
  for (let i = 0; i < chrom.weights.length; i++) {
    if (Math.random() < rate) {
      chrom.weights[i] += gaussianRandom() * 0.3
      chrom.weights[i] = Math.max(0, chrom.weights[i])
    }
  }
}

/**
 * Normalize weights to sum to 1.0.
 */
function normalizeWeights(weights: number[]): void {
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0)
  if (sum > 0) {
    for (let i = 0; i < weights.length; i++) {
      weights[i] = Math.max(0, weights[i]) / sum
    }
  } else {
    // Uniform if all zero
    const uniform = 1 / weights.length
    weights.fill(uniform)
  }
}

/**
 * Box-Muller transform for Gaussian random numbers.
 */
function gaussianRandom(): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
}
