/**
 * Compound-Dirichlet-Multinomial (CDM) Prediction Model
 * Based on: Nkomozake (2024) "Predicting Winning Lottery Numbers" arXiv:2403.12836
 * 
 * Bayesian approach: calculates posterior probability for each number
 * using Dirichlet-Multinomial distribution with exponential decay weighting.
 * 
 * P(number | history) ∝ P(history | number) × P(number)
 */

export interface CDMScore {
  number: number;
  posterior: number;      // posterior probability
  prior: number;          // prior probability
  likelihood: number;     // likelihood given history
  confidence: number;     // confidence interval width
  source: string;
}

/**
 * Compute CDM scores for all numbers (00-99) given historical draws.
 * Uses exponential decay to weight recent draws more heavily.
 */
export function computeCDM(
  sequences: number[][],
  options: {
    window?: number;        // use last N draws (default: all)
    decayFactor?: number;   // exponential decay λ (default: 0.02)
    priorAlpha?: number;    // Dirichlet prior α (default: 1.0 = uniform)
  } = {}
): CDMScore[] {
  const {
    window = sequences.length,
    decayFactor = 0.02,
    priorAlpha = 1.0,
  } = options;

  const recentDraws = sequences.slice(0, Math.min(window, sequences.length));
  const totalDraws = recentDraws.length;
  const N = 100; // numbers 00-99

  // Step 1: Compute weighted frequency counts with exponential decay
  const weightedCounts = new Array(N).fill(0);
  let totalWeight = 0;

  for (let i = 0; i < recentDraws.length; i++) {
    const draw = recentDraws[i];
    const weight = Math.exp(-decayFactor * i); // more recent = higher weight
    totalWeight += weight;

    for (const num of draw) {
      const n = num % 100;
      if (n >= 0 && n < N) {
        weightedCounts[n] += weight;
      }
    }
  }

  // Step 2: Compute Dirichlet-Multinomial posterior
  // For CDM, the posterior predictive is:
  // P(X=k | data) = (α_k + n_k) / (K*α + Σn_j)
  // where α_k = prior, n_k = weighted count, K = 100 numbers
  
  const alphaSum = N * priorAlpha; // total prior mass
  const countSum = totalWeight;    // total weighted observations

  const scores: CDMScore[] = [];

  for (let k = 0; k < N; k++) {
    const prior = priorAlpha / alphaSum;
    const posterior = (priorAlpha + weightedCounts[k]) / (alphaSum + countSum);
    const likelihood = totalWeight > 0 ? weightedCounts[k] / totalWeight : 1 / N;
    
    // Confidence: based on effective sample size
    const effectiveN = totalWeight;
    const se = Math.sqrt(posterior * (1 - posterior) / (effectiveN + 1));
    const confidence = 1 - 2 * se; // wider interval = less confident

    scores.push({
      number: k,
      posterior,
      prior,
      likelihood,
      confidence: Math.max(0, Math.min(1, confidence)),
      source: "cdm",
    });
  }

  // Normalize posteriors to sum to 1
  const totalPosterior = scores.reduce((s, c) => s + c.posterior, 0);
  for (const s of scores) {
    s.posterior /= totalPosterior;
  }

  return scores.sort((a, b) => b.posterior - a.posterior);
}

/**
 * Multi-window CDM: combines short-term and long-term posteriors
 * for a more robust prediction.
 */
export function multiWindowCDM(
  sequences: number[][],
  windows: number[] = [10, 30, 50, 100],
  decayFactor: number = 0.02
): CDMScore[] {
  const allScores: CDMScore[][] = [];

  for (const w of windows) {
    if (w <= sequences.length) {
      allScores.push(computeCDM(sequences, { window: w, decayFactor }));
    }
  }

  if (allScores.length === 0) {
    return computeCDM(sequences, { decayFactor });
  }

  // Combine: average posterior across windows
  const combined = new Map<number, { posterior: number; count: number }>();

  for (const scores of allScores) {
    for (const s of scores) {
      const existing = combined.get(s.number) || { posterior: 0, count: 0 };
      existing.posterior += s.posterior;
      existing.count += 1;
      combined.set(s.number, existing);
    }
  }

  const result: CDMScore[] = [];
  for (const [num, data] of combined) {
    result.push({
      number: num,
      posterior: data.posterior / data.count,
      prior: 1 / 100,
      likelihood: data.posterior / data.count,
      confidence: 0.5,
      source: "cdm-multi",
    });
  }

  return result.sort((a, b) => b.posterior - a.posterior);
}
