/**
 * ONLINE LEARNING
 * 
 * Updates model weights incrementally based on prediction performance.
 * Uses exponential moving average and regret minimization.
 */

export interface OnlineLearnerState {
  weights: Record<string, number>;
  performance: Array<{
    date: string;
    turno: string;
    hitRate: number;
    weights: Record<string, number>;
  }>;
  totalUpdates: number;
}

export class OnlineLearner {
  private state: OnlineLearnerState;
  private learningRate: number;
  private decayFactor: number;

  constructor(
    initialWeights?: Record<string, number>,
    learningRate: number = 0.05,
    decayFactor: number = 0.95
  ) {
    this.learningRate = learningRate
    this.decayFactor = decayFactor
    this.state = {
      weights: initialWeights || {
        factores30: 0.40,
        montecarlo: 0.20,
        crossTurno: 0.10,
        seasonal: 0.06,
        correlation: 0.08,
        markovSuperior: 0.10,
        cyclic: 0.06,
      },
      performance: [],
      totalUpdates: 0
    }
  }

  /**
   * Update weights based on a new observation.
   * @param factorHits - Which factors contributed to correct predictions
   * @param hitRate - Overall hit rate for this prediction
   */
  update(factorHits: Record<string, number>, hitRate: number): void {
    const totalHits = Object.values(factorHits).reduce((a, b) => a + b, 0)
    if (totalHits === 0) return

    // Calculate contribution of each factor
    const contributions: Record<string, number> = {}
    for (const [factor, hits] of Object.entries(factorHits)) {
      contributions[factor] = hits / totalHits
    }

    // Update weights using exponential moving average
    for (const [factor, weight] of Object.entries(this.state.weights)) {
      const contribution = contributions[factor] || 0
      const error = contribution - weight
      this.state.weights[factor] = weight + this.learningRate * error
    }

    // Normalize
    const sum = Object.values(this.state.weights).reduce((a, b) => a + b, 0)
    if (sum > 0) {
      for (const factor of Object.keys(this.state.weights)) {
        this.state.weights[factor] /= sum
      }
    }

    // Record performance
    this.state.performance.push({
      date: new Date().toISOString(),
      turno: "",
      hitRate,
      weights: { ...this.state.weights }
    })

    // Keep only last 100 records
    if (this.state.performance.length > 100) {
      this.state.performance = this.state.performance.slice(-100)
    }

    this.state.totalUpdates++

    // Decay learning rate over time
    this.learningRate *= this.decayFactor
    this.learningRate = Math.max(0.001, this.learningRate)
  }

  getWeights(): Record<string, number> {
    return { ...this.state.weights }
  }

  getState(): OnlineLearnerState {
    return { ...this.state }
  }

  /**
   * Get confidence in current weights based on performance history.
   * Higher confidence = weights have been validated by more observations.
   */
  getConfidence(): number {
    if (this.state.performance.length < 5) return 0.3

    const recentHits = this.state.performance.slice(-10).map(p => p.hitRate)
    const avgHitRate = recentHits.reduce((a, b) => a + b, 0) / recentHits.length

    // Stability: how consistent are the weights?
    const recentWeights = this.state.performance.slice(-10).map(p => p.weights)
    const weightVariance = this.calculateWeightVariance(recentWeights)

    // Confidence = f(stability, sample size, hit rate)
    const stabilityScore = Math.max(0, 1 - weightVariance * 10)
    const sampleScore = Math.min(1, this.state.performance.length / 50)
    const hitScore = Math.min(1, avgHitRate * 5)

    return (stabilityScore * 0.4 + sampleScore * 0.3 + hitScore * 0.3)
  }

  private calculateWeightVariance(weights: Record<string, number>[]): number {
    if (weights.length < 2) return 0

    const factors = Object.keys(weights[0])
    let totalVariance = 0

    for (const factor of factors) {
      const values = weights.map(w => w[factor] || 0)
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length
      totalVariance += variance
    }

    return totalVariance / factors.length
  }

  /**
   * Export state for persistence (e.g., to Supabase or file).
   */
  exportState(): string {
    return JSON.stringify(this.state)
  }

  /**
   * Import state from persistence.
   */
  static importState(json: string): OnlineLearner {
    try {
      const state = JSON.parse(json)
      const learner = new OnlineLearner()
      learner.state = state
      return learner
    } catch {
      return new OnlineLearner()
    }
  }
}
