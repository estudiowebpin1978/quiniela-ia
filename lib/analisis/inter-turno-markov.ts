/**
 * Inter-Turno Markov Chains (Higher-Order)
 * 
 * Models conditional probability between turns:
 * P(X_t | X_{t-1}, X_{t-2})
 * 
 * Detects patterns like: "when Previa ends in 4 and Primera ends in 7,
 * Matutina historically ends in 2 at a rate 2.3x above uniform."
 */

export interface MarkovTransition {
  fromState: string       // e.g., "4,7" (last digits of prev 2 turns)
  toNumber: number        // 0-99
  probability: number
  support: number         // How many times this transition was observed
  confidence: number      // Confidence level based on sample size
}

export interface InterTurnoResult {
  transitions: Map<string, Map<number, { probability: number; support: number }>>
  order: number
  entropyPerState: Map<string, number>
  patterns: MarkovPattern[]
  totalTransitions: number
}

export interface MarkovPattern {
  state: string
  nextNumber: number
  probability: number
  expectedProbability: number
  lift: number              // ratio / expected
  support: number
  confidence: number
  description: string
}

/**
 * Compute inter-turno Markov transition matrices.
 * 
 * @param turnSequences - Map of turno name → ordered list of number sequences
 *   e.g., { "Matutina": [[23,45,...], [12,67,...], ...] }
 * @param order - Markov order (default 2: uses last 2 turns to predict next)
 * @param minSupport - Minimum transitions required for pattern to be reported
 */
export function computeInterTurnoMarkov(
  turnSequences: Map<string, number[][]>,
  order: number = 2,
  minSupport: number = 5
): InterTurnoResult {
  const transitions = new Map<string, Map<number, { probability: number; support: number }>>()
  const entropyPerState = new Map<string, number>()
  const patterns: MarkovPattern[] = []

  const turnNames = Array.from(turnSequences.keys())
  if (turnNames.length < 2) {
    return {
      transitions,
      order,
      entropyPerState,
      patterns,
      totalTransitions: 0
    }
  }

  // Build state sequence: for each draw, extract the "state" from preceding turns
  // State = last digit of each of the `order` preceding turns
  const stateSequence: Array<{ state: string; nextNumber: number }> = []

  // Find the common date range across all turns
  const allDates = new Set<string>()
  for (const [, seqs] of turnSequences) {
    // Assume sequences are indexed by draw order (most recent first)
    // We need at least `order + 1` draws per turn
  }

  // Build state→next transitions
  for (let i = order; i < Array.from(turnSequences.values())[0].length; i++) {
    // State = concatenation of last digits from `order` preceding turns
    const stateParts: string[] = []
    let valid = true

    for (const name of turnNames) {
      const seqs = turnSequences.get(name)
      if (!seqs || i > seqs.length) {
        valid = false
        break
      }
      // Use first number of each turn as representative
      const firstNum = seqs[i]?.[0]
      if (firstNum === undefined) {
        valid = false
        break
      }
      stateParts.push(String(firstNum % 10))
    }

    if (!valid) continue

    const state = stateParts.join(',')

    // Next number = first number of the "target" turn (last turn in the list)
    const targetTurn = turnNames[turnNames.length - 1]
    const targetSeqs = turnSequences.get(targetTurn)
    if (!targetSeqs || i - order < 0) continue

    const nextNum = targetSeqs[i - order]?.[0]
    if (nextNum === undefined) continue

    stateSequence.push({
      state,
      nextNumber: nextNum % 100
    })
  }

  // Count transitions
  const stateCounts = new Map<string, Map<number, number>>()
  const stateTotals = new Map<string, number>()

  for (const { state, nextNumber } of stateSequence) {
    if (!stateCounts.has(state)) {
      stateCounts.set(state, new Map())
      stateTotals.set(state, 0)
    }
    const stateMap = stateCounts.get(state)!
    stateMap.set(nextNumber, (stateMap.get(nextNumber) ?? 0) + 1)
    stateTotals.set(state, (stateTotals.get(state) ?? 0) + 1)
  }

  // Convert to probabilities and compute per-state entropy
  let totalTransitions = 0

  for (const [state, nextMap] of stateCounts) {
    const total = stateTotals.get(state) ?? 1
    totalTransitions += total

    const probMap = new Map<number, { probability: number; support: number }>()
    let entropy = 0

    for (const [num, count] of nextMap) {
      const prob = count / total
      probMap.set(num, { probability: prob, support: count })
      if (prob > 0) {
        entropy -= prob * Math.log2(prob)
      }
    }

    transitions.set(state, probMap)
    entropyPerState.set(state, entropy)

    // Find patterns where probability significantly exceeds uniform expectation
    const expectedProb = 1 / 100  // Uniform expectation for numbers 0-99
    for (const [num, { probability, support }] of probMap) {
      if (support >= minSupport && probability > expectedProb * 1.5) {
        const lift = probability / expectedProb
        const confidence = Math.min(1, support / 20) // Confidence based on sample size

        patterns.push({
          state,
          nextNumber: num,
          probability,
          expectedProbability: expectedProb,
          lift,
          support,
          confidence,
          description: `When [${state}] → ${num} at ${(probability * 100).toFixed(1)}% (×${lift.toFixed(1)} above uniform)`
        })
      }
    }
  }

  // Sort patterns by lift descending
  patterns.sort((a, b) => b.lift - a.lift)

  return {
    transitions,
    order,
    entropyPerState,
    patterns: patterns.slice(0, 50), // Top 50 patterns
    totalTransitions
  }
}

/**
 * Get Markov scores for each number based on current state.
 * 
 * @param markov - Pre-computed inter-turno Markov result
 * @param currentState - Array of last digits from the `order` preceding turns
 * @returns Array of 100 scores (one per number, 0-99)
 */
export function getMarkovScores(
  markov: InterTurnoResult,
  currentState: number[]
): number[] {
  const scores = new Array(100).fill(0)

  // Build state key from current turn digits
  const stateKey = currentState
    .slice(0, markov.order)
    .map(n => String(n % 10))
    .join(',')

  const stateProbs = markov.transitions.get(stateKey)
  if (!stateProbs) {
    // No data for this state → return uniform scores
    return scores.fill(1 / 100)
  }

  // Get probabilities for each number
  let maxProb = 0
  for (const [num, { probability }] of stateProbs) {
    scores[num] = probability
    if (probability > maxProb) maxProb = probability
  }

  // Normalize to [0, 1]
  if (maxProb > 0) {
    return scores.map(s => s / maxProb)
  }

  return scores
}

/**
 * Check if current state is in a low-entropy (predictable) regime.
 */
export function isLowEntropyState(
  markov: InterTurnoResult,
  currentState: number[]
): boolean {
  const stateKey = currentState
    .slice(0, markov.order)
    .map(n => String(n % 10))
    .join(',')

  const entropy = markov.entropyPerState.get(stateKey)
  if (entropy === undefined) return false

  // Max entropy for 100 outcomes ≈ 6.64
  // Low entropy = < 50% of max
  return entropy < 3.32
}
