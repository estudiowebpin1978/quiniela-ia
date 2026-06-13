/**
 * GRAPH MODELS for Number Relationships
 * 
 * Builds a graph where:
 * - Nodes = numbers (0-99)
 * - Edges = co-occurrence in same draw (weighted by frequency)
 * 
 * Metrics:
 * - PageRank: numbers connected to other frequent numbers score higher
 * - Centrality: numbers that bridge different clusters
 * - Community Detection: clusters of numbers that tend to appear together
 * - HITS: hub vs authority scores
 */

export interface GraphResult {
  scores: number[];
  pagerank: number[];
  centrality: number[];
  communities: number[];
  hubScores: number[];
  authorityScores: number[];
}

export function analyzeGraph(sequences: number[][]): GraphResult {
  const n = 100
  const lastNums = sequences.map(s => s.map(x => x % 100))

  // Build adjacency matrix (weighted by co-occurrence)
  const adj = Array.from({ length: n }, () => new Array(n).fill(0))
  const degrees = new Array(n).fill(0)

  for (const draw of lastNums) {
    const unique = [...new Set(draw.filter(x => x >= 0 && x < n))]
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        adj[unique[i]][unique[j]]++
        adj[unique[j]][unique[i]]++
      }
      degrees[unique[i]]++
    }
  }

  // === PageRank ===
  const pagerank = computePageRank(adj, n, 0.85, 50)

  // === Betweenness Centrality (approximation) ===
  const centrality = computeCentrality(adj, n)

  // === Community Detection (Louvain-like greedy modularity) ===
  const communities = detectCommunities(adj, n)

  // === HITS (Hub/Authority) ===
  const { hubs, authorities } = computeHITS(adj, n, 20)

  // Combine all metrics into final score
  const scores = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    scores[i] = (
      pagerank[i] * 0.35 +
      centrality[i] * 0.25 +
      hubs[i] * 0.20 +
      authorities[i] * 0.20
    )
  }

  // Normalize
  const maxScore = Math.max(...scores, 0.001)
  for (let i = 0; i < n; i++) scores[i] /= maxScore

  return { scores, pagerank, centrality, communities, hubScores: hubs, authorityScores: authorities }
}

function computePageRank(adj: number[][], n: number, damping: number, iterations: number): number[] {
  let pr = new Array(n).fill(1 / n)
  const outSum = new Array(n).fill(0)

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) outSum[i] += adj[i][j]
  }

  for (let iter = 0; iter < iterations; iter++) {
    const newPr = new Array(n).fill((1 - damping) / n)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (adj[j][i] > 0 && outSum[j] > 0) {
          newPr[i] += damping * pr[j] * (adj[j][i] / outSum[j])
        }
      }
    }
    pr = newPr
  }

  // Normalize to [0, 1]
  const max = Math.max(...pr, 0.001)
  return pr.map(p => p / max)
}

function computeCentrality(adj: number[][], n: number): number[] {
  // Approximate betweenness using BFS from each node
  const centrality = new Array(n).fill(0)

  for (let s = 0; s < n; s++) {
    const dist = new Array(n).fill(-1)
    const sigma = new Array(n).fill(0)
    const delta = new Array(n).fill(0)
    dist[s] = 0
    sigma[s] = 1

    const queue = [s]
    const stack: number[] = []

    while (queue.length > 0) {
      const v = queue.shift()!
      stack.push(v)
      for (let w = 0; w < n; w++) {
        if (adj[v][w] <= 0) continue
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1
          queue.push(w)
        }
        if (dist[w] === dist[v] + 1) {
          sigma[w] += sigma[v]
        }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!
      for (let v = 0; v < n; v++) {
        if (adj[v][w] <= 0) continue
        if (dist[v] === dist[w] - 1) {
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w])
        }
      }
      if (w !== s) centrality[w] += delta[w]
    }
  }

  // Normalize
  const max = Math.max(...centrality, 0.001)
  return centrality.map(c => c / max)
}

function detectCommunities(adj: number[][], n: number): number[] {
  // Greedy modularity community detection
  const communities = Array.from({ length: n }, (_, i) => i)
  const degree = new Array(n).fill(0)
  const m2 = adj.reduce((sum, row) => sum + row.reduce((a, b) => a + b, 0), 0)
  if (m2 === 0) return communities

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) degree[i] += adj[i][j]
  }

  // Simple greedy: merge communities with highest inter-community edge weight
  for (let iter = 0; iter < 50; iter++) {
    let bestGain = 0
    let bestI = -1
    let bestJ = -1

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (communities[i] === communities[j]) continue

        // Calculate modularity gain from merging
        let interEdges = adj[i][j]
        let ki = degree[i]
        let kj = degree[j]

        const gain = (interEdges / m2) - (ki * kj) / (2 * m2 * m2)
        if (gain > bestGain) {
          bestGain = gain
          bestI = i
          bestJ = j
        }
      }
    }

    if (bestI >= 0 && bestGain > 0) {
      const oldComm = communities[bestJ]
      const newComm = communities[bestI]
      for (let k = 0; k < n; k++) {
        if (communities[k] === oldComm) communities[k] = newComm
      }
    } else {
      break
    }
  }

  // Normalize community IDs
  const unique = [...new Set(communities)]
  const map = new Map(unique.map((c, i) => [c, i]))
  return communities.map(c => map.get(c) || 0)
}

function computeHITS(adj: number[][], n: number, iterations: number): { hubs: number[]; authorities: number[] } {
  let h = new Array(n).fill(1 / n)
  let a = new Array(n).fill(1 / n)

  for (let iter = 0; iter < iterations; iter++) {
    // Authority update
    const newA = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (adj[j][i] > 0) newA[i] += h[j]
      }
    }
    const aNorm = Math.sqrt(newA.reduce((s, v) => s + v * v, 0)) || 1
    for (let i = 0; i < n; i++) a[i] = newA[i] / aNorm

    // Hub update
    const newH = new Array(n).fill(0)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (adj[i][j] > 0) newH[i] += a[j]
      }
    }
    const hNorm = Math.sqrt(newH.reduce((s, v) => s + v * v, 0)) || 1
    for (let i = 0; i < n; i++) h[i] = newH[i] / hNorm
  }

  // Normalize to [0, 1]
  const hMax = Math.max(...h, 0.001)
  const aMax = Math.max(...a, 0.001)

  return {
    hubs: h.map(v => v / hMax),
    authorities: a.map(v => v / aMax)
  }
}
