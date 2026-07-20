/**
 * HIGHER-ORDER MARKOV CHAINS
 * 
 * Current system: 1st order (only looks at last number).
 * This: 2nd, 3rd, and 4th order chains.
 * Also includes transition entropy and mixing time.
 */

export interface MarkovResult {
  scores: number[];
  transitionEntropy: number;
  mixingTime: number;
  orderUsed: number;
}

export function higherOrderMarkov(
  sequences: number[][],
  maxOrder: number = 4,
): MarkovResult {
  const n = 100
  const lastNums = sequences.map(s => s.map(x => x % 100))

  // Flatten to a single sequence using ALL numbers from each draw (not just the first)
  const flatSequence: number[] = []
  for (const draw of lastNums) {
    for (const num of draw) {
      if (num >= 0 && num <= 99) flatSequence.push(num)
    }
  }

  if (flatSequence.length < maxOrder + 10) {
    return { scores: new Array(n).fill(1 / n), transitionEntropy: 0, mixingTime: 0, orderUsed: 1 }
  }

  // Find optimal order using BIC-like criterion
  let bestOrder = 1
  let bestScore = -Infinity

  for (let order = 1; order <= Math.min(maxOrder, flatSequence.length - 10); order++) {
    const transitions = new Map<string, Map<number, number>>()
    const totalFrom = new Map<string, number>()

    for (let i = order; i < flatSequence.length; i++) {
      const state = flatSequence.slice(i - order, i).join(",")
      const next = flatSequence[i]
      if (!transitions.has(state)) transitions.set(state, new Map())
      const nextMap = transitions.get(state)!
      nextMap.set(next, (nextMap.get(next) || 0) + 1)
      totalFrom.set(state, (totalFrom.get(state) || 0) + 1)
    }

    // Calculate log-likelihood
    let logLikelihood = 0
    let numParams = 0
    for (const [state, nextMap] of transitions) {
      const total = totalFrom.get(state)!
      for (const [, count] of nextMap) {
        logLikelihood += count * Math.log(count / total)
      }
      numParams += nextMap.size
    }

    // BIC penalty
    const bic = logLikelihood - (numParams / 2) * Math.log(flatSequence.length - order)
    if (bic > bestScore) {
      bestScore = bic
      bestOrder = order
    }
  }

  // Build transition matrix for best order
  const transitions = new Map<string, Map<number, number>>()
  const totalFrom = new Map<string, number>()

  for (let i = bestOrder; i < flatSequence.length; i++) {
    const state = flatSequence.slice(i - bestOrder, i).join(",")
    const next = flatSequence[i]
    if (!transitions.has(state)) transitions.set(state, new Map())
    const nextMap = transitions.get(state)!
    nextMap.set(next, (nextMap.get(next) || 0) + 1)
    totalFrom.set(state, (totalFrom.get(state) || 0) + 1)
  }

  // Predict next number using the current state
  const currentState = flatSequence.slice(-bestOrder).join(",")
  const scores = new Array(n).fill(0)

  if (transitions.has(currentState)) {
    const nextMap = transitions.get(currentState)!
    const total = totalFrom.get(currentState)!
    for (let num = 0; num < n; num++) {
      scores[num] = (nextMap.get(num) || 0) / total
    }
  } else {
    // Fallback: use lower-order chain
    for (let order = bestOrder - 1; order >= 1; order--) {
      const state = flatSequence.slice(-order).join(",")
      if (transitions.has(state)) {
        const nextMap = transitions.get(state)!
        const total = totalFrom.get(state)!
        for (let num = 0; num < n; num++) {
          scores[num] = (nextMap.get(num) || 0) / total
        }
        break
      }
    }
  }

  // Transition entropy (higher = more random)
  let totalEntropy = 0
  let stateCount = 0
  for (const [, nextMap] of transitions) {
    const total = totalFrom.get(Array.from(transitions.keys())[stateCount]) || 1
    let entropy = 0
    for (const [, count] of nextMap) {
      const p = count / total
      if (p > 0) entropy -= p * Math.log2(p)
    }
    totalEntropy += entropy
    stateCount++
  }
  const transitionEntropy = stateCount > 0 ? totalEntropy / stateCount : 0

  // Mixing time estimate (how many steps to reach stationary distribution)
  const stationary = new Array(n).fill(0)
  for (const [, nextMap] of transitions) {
    for (const [num, count] of nextMap) {
      stationary[num] += count
    }
  }
  const statTotal = stationary.reduce((a, b) => a + b, 0)
  for (let i = 0; i < n; i++) stationary[i] /= statTotal

  // Estimate mixing time via total variation distance convergence
  let dist = scores.slice()
  let mixingSteps = 0
  const threshold = 0.01
  for (let step = 0; step < 50; step++) {
    const newDist = new Array(n).fill(0)
    for (let from = 0; from < n; from++) {
      if (dist[from] <= 0) continue
      const stateKey = flatSequence.slice(-bestOrder).join(",")
      const nextMap = transitions.get(stateKey)
      if (nextMap) {
        const total = totalFrom.get(stateKey) || 1
        for (let to = 0; to < n; to++) {
          newDist[to] += dist[from] * ((nextMap.get(to) || 0) / total)
        }
      }
    }
    const tvd = newDist.reduce((sum, p, i) => sum + Math.abs(p - stationary[i]), 0) / 2
    dist = newDist
    if (tvd < threshold) { mixingSteps = step + 1; break }
    if (step === 49) mixingSteps = 50
  }

  // Normalize scores
  const maxScore = Math.max(...scores, 0.0001)
  const normalizedScores = scores.map(s => s / maxScore)

  return {
    scores: normalizedScores,
    transitionEntropy,
    mixingTime: mixingSteps,
    orderUsed: bestOrder
  }
}
