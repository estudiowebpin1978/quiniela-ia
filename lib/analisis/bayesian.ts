/**
 * BAYESIAN UNCERTAINTY QUANTIFICATION
 * 
 * Dirichlet-Multinomial posterior for lottery number probabilities.
 * Computes credible intervals and posterior mass for ranking.
 */

/**
 * For each number (0-99), compute posterior probability using Dirichlet-Multinomial.
 * Returns credible intervals (95%) and posterior mass in top-N.
 */
export function bayesianAnalysis(
  sequences: number[][],
  topN: number = 10,
  priorStrength: number = 1,
): {
  posterior: number[];
  credibleIntervals: Array<{ lo: number; hi: number }>;
  posteriorMassTopN: number;
  entropy: number;
  effectiveSampleSize: number;
} {
  const n = 100;
  const totalCounts = new Array(n).fill(0);
  let totalDraws = 0;

  for (const seq of sequences) {
    const last2 = seq.map(x => x % 100);
    for (const num of last2) {
      if (num >= 0 && num < n) {
        totalCounts[num]++;
      }
    }
    totalDraws++;
  }

  // Dirichlet posterior: alpha_i = priorStrength + count_i
  const alpha = totalCounts.map(c => priorStrength + c);
  const alphaSum = alpha.reduce((a, b) => a + b, 0);

  // Posterior mean (probability)
  const posterior = alpha.map(a => a / alphaSum);

  // 95% credible intervals using normal approximation to Dirichlet
  // Var(p_i) = alpha_i * (alphaSum - alpha_i) / (alphaSum^2 * (alphaSum + 1))
  const credibleIntervals = alpha.map(a => {
    const varP = (a * (alphaSum - a)) / (alphaSum * alphaSum * (alphaSum + 1));
    const sd = Math.sqrt(varP);
    // 95% interval: mean ± 1.96 * sd
    const mean = a / alphaSum;
    return {
      lo: Math.max(0, mean - 1.96 * sd),
      hi: Math.min(1, mean + 1.96 * sd),
    };
  });

  // Posterior mass that each number is in top-N
  // Approximate: sort by posterior mean, compute probability that top-N stays top-N
  const indices = posterior.map((p, i) => ({ p, i })).sort((a, b) => b.p - a.p);
  const topSet = new Set(indices.slice(0, topN).map(x => x.i));

  // Probability mass in top-N = sum of posterior means for top-N numbers
  const posteriorMassTopN = indices.slice(0, topN).reduce((s, x) => s + x.p, 0);

  // Entropy of posterior
  const entropy = -posterior.reduce((s, p) => {
    if (p > 0) return s + p * Math.log2(p);
    return s;
  }, 0);

  // Effective sample size (concentration)
  const effectiveSampleSize = alphaSum;

  return { posterior, credibleIntervals, posteriorMassTopN, entropy, effectiveSampleSize };
}

/**
 * Compute Bayesian confidence for each number in the ranking.
 * Uses credible interval width: narrower = more confident.
 */
export function bayesianConfidence(
  credibleIntervals: Array<{ lo: number; hi: number }>,
  posterior: number[],
): number[] {
  return credibleIntervals.map((ci, i) => {
    const width = ci.hi - ci.lo;
    const mean = posterior[i];
    // Confidence = how concentrated the posterior is relative to uniform
    // Uniform = 0.01 width, so narrow interval = high confidence
    // Scale: if width < 0.005 (very narrow) -> high confidence
    //        if width > 0.02 (wide) -> low confidence
    const concentrationScore = Math.max(0, 1 - (width - 0.005) / 0.015);
    // Boost if posterior mean is high
    const meanBoost = mean > 0.015 ? 1.2 : mean > 0.012 ? 1.1 : 1.0;
    return Math.min(95, Math.round(concentrationScore * meanBoost * 100));
  });
}

/**
 * Bayesian credible set: numbers most likely to be in the true top-N.
 * Returns numbers with highest posterior probability of being drawn.
 */
export function bayesianCredibleSet(
  posterior: number[],
  credibleIntervals: Array<{ lo: number; hi: number }>,
  setSize: number = 10,
): Array<{ num: number; posterior: number; ciWidth: number; rank: number }> {
  const results = posterior.map((p, i) => ({
    num: i,
    posterior: p,
    ciWidth: credibleIntervals[i].hi - credibleIntervals[i].lo,
    rank: 0,
  }));

  // Sort by posterior (highest first)
  results.sort((a, b) => b.posterior - a.posterior);

  // Assign ranks
  results.forEach((r, idx) => { r.rank = idx + 1; });

  return results.slice(0, setSize);
}
