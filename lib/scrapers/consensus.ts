/**
 * Tri-Consensus Scraper (3-Node Quorum)
 *
 * Fetches from THREE sources in PARALLEL via Promise.allSettled():
 *   1. quinieleando.com.ar
 *   2. numerosenvivo.com.ar
 *   3. loteriadelaciudad.gob.ar (official CABA government)
 *
 * Quorum matrix:
 *   3/3 match       → ✅ APPROVED (highest confidence)
 *   2/3 match       → ✅ APPROVED (majority wins)
 *   1/3 responds    → ❌ ABORT (insufficient data)
 *   0/3 responds    → ❌ ABORT (all sources down)
 *   3 different     → ❌ ABORT (anomaly — possible data corruption)
 */

import { parseQuinieleando, parseNumerosEnvivo } from "./parsers"
import { parseLoteriaOficial } from "./parsers"
import type { ScraperStrategy } from "./strategy"
import { isSourceQuarantined, recordSourceResult } from "./circuit-breaker"
import type { SourceStats, TurnoType, ScrapeResult } from "./types"
import logger from "@/lib/logger"

// ══════════════════════════════════════════════════════════════════════════════
// Strategy instances — each source is a self-contained module
// ══════════════════════════════════════════════════════════════════════════════

const STRATEGIES: ScraperStrategy[] = [
  {
    name: "quinieleando.com.ar",
    baseUrl: "https://www.quinieleando.com.ar/quinielas/nacional/resultados-de-hoy",
    async fetch(fechaISO, fechaUrl, turno) {
      return parseQuinieleando(fechaISO, fechaUrl, turno)
    },
  },
  {
    name: "numerosenvivo.com.ar",
    baseUrl: "https://numerosenvivo.com.ar/quiniela/ciudad",
    async fetch(fechaISO, fechaUrl, turno) {
      return parseNumerosEnvivo(fechaISO, fechaUrl, turno)
    },
  },
  {
    name: "loteriadelaciudad.gob.ar",
    baseUrl: "https://quiniela.loteriadelaciudad.gob.ar/",
    async fetch(fechaISO, fechaUrl, turno) {
      return parseLoteriaOficial(fechaISO, fechaUrl, turno)
    },
  },
]

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

export interface SourceNode {
  name: string
  numbers: number[]
  cabeza: number | null
  ok: boolean
}

export interface ConsensusResult {
  ok: boolean
  numbers: number[]
  source: string
  consensusMethod:
    | "tri_full_match"
    | "tri_majority"
    | "orchestrator_fallback"
    | "abort_no_quorum"
  nodes: SourceNode[]
  quorum: { total: number; matchCount: number; matchValue: number | null }
  divergenceDetails?: string
  duration: number
}

// ══════════════════════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════════════════════

const FETCH_TIMEOUT = 5000
const MAX_RETRIES = 1
const BASE_DELAY = 1500

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])

function track(stats: SourceStats, src: string, ok: boolean, duration: number): void {
  if (!stats[src]) stats[src] = { ok: 0, fail: 0, totalDuration: 0 }
  stats[src][ok ? "ok" : "fail"]++
  stats[src].totalDuration += duration
}

/**
 * Fetch a single source with retry + timeout + circuit breaker.
 */
async function fetchNode(
  strategy: ScraperStrategy,
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
): Promise<SourceNode> {
  const node: SourceNode = { name: strategy.name, numbers: [], cabeza: null, ok: false }

  const breakerState = await isSourceQuarantined(strategy.name)
  if (breakerState.isQuarantined) {
    logger.info("[tri-consensus] Source quarantined, skipping", {
      source: strategy.name,
      consecutiveFailures: breakerState.consecutiveFailures,
    })
    return node
  }

  const attempts = MAX_RETRIES + 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = BASE_DELAY * Math.pow(2, attempt - 1)
      await new Promise((r) => setTimeout(r, backoff))
    }

    const t0 = Date.now()
    try {
      const result = await withTimeout(strategy.fetch(fechaISO, fechaUrl, turno), FETCH_TIMEOUT)
      const dur = Date.now() - t0

      if (result && result.numbers.length >= 20) {
        node.numbers = result.numbers
        node.cabeza = result.numbers[0]
        node.ok = true
        track(stats, strategy.name, true, dur)
        await recordSourceResult(strategy.name, true)
        return node
      }

      track(stats, strategy.name, false, dur)
    } catch {
      track(stats, strategy.name, false, Date.now() - t0)
    }
  }

  await recordSourceResult(strategy.name, false)
  return node
}

/**
 * Compute quorum from 3 source nodes.
 * Returns the majority cabeza value and how many sources agree on it.
 */
function computeQuorum(nodes: SourceNode[]): {
  matchCount: number
  matchValue: number | null
  majorityNumbers: number[]
  majoritySource: string
} {
  const validNodes = nodes.filter((n) => n.ok && n.cabeza !== null)

  if (validNodes.length === 0) {
    return { matchCount: 0, matchValue: null, majorityNumbers: [], majoritySource: "none" }
  }

  // Count how many sources agree on each cabeza value
  const votes = new Map<number, { count: number; numbers: number[]; source: string }>()
  for (const node of validNodes) {
    const key = node.cabeza!
    const existing = votes.get(key)
    if (existing) {
      existing.count++
    } else {
      votes.set(key, { count: 1, numbers: node.numbers, source: node.name })
    }
  }

  // Find the majority value
  let best = { count: 0, value: null as number | null, numbers: [] as number[], source: "none" }
  for (const [value, entry] of votes) {
    if (entry.count > best.count) {
      best = { count: entry.count, value, numbers: entry.numbers, source: entry.source }
    }
  }

  return {
    matchCount: best.count,
    matchValue: best.value,
    majorityNumbers: best.numbers,
    majoritySource: best.source,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Main entry point
// ══════════════════════════════════════════════════════════════════════════════

export async function fetchWithConsensus(
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
): Promise<ConsensusResult> {
  const startTime = Date.now()

  // ── PARALLEL: fetch all 3 sources simultaneously ──
  const settled = await Promise.allSettled(
    STRATEGIES.map((s) => fetchNode(s, fechaISO, fechaUrl, turno, stats)),
  )

  const nodes: SourceNode[] = settled.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : { name: STRATEGIES[i].name, numbers: [], cabeza: null, ok: false },
  )

  const okCount = nodes.filter((n) => n.ok).length
  const quorum = computeQuorum(nodes)

  // ── QUORUM MATRIX ──

  // CASE 1: 3/3 match → full consensus
  if (okCount === 3 && quorum.matchCount === 3) {
    logger.info("[tri-consensus] 3/3 FULL MATCH", {
      fecha: fechaISO,
      turno,
      cabeza: quorum.matchValue,
      duration: Date.now() - startTime,
    })
    return buildResult("tri_full_match", quorum.majorityNumbers, `${nodes.map((n) => n.name).join("+")}`, nodes, quorum, startTime)
  }

  // CASE 2: 2/3 match → majority quorum
  if (okCount >= 2 && quorum.matchCount >= 2) {
    logger.info("[tri-consensus] 2/3 MAJORITY", {
      fecha: fechaISO,
      turno,
      cabeza: quorum.matchValue,
      matchCount: quorum.matchCount,
      majoritySource: quorum.majoritySource,
      duration: Date.now() - startTime,
    })
    return buildResult("tri_majority", quorum.majorityNumbers, quorum.majoritySource, nodes, quorum, startTime)
  }

  // CASE 3: 1/3 responds → ABORT (need at least 2 sources for quorum)
  if (okCount === 1) {
    const survivor = nodes.find((n) => n.ok)!
    logger.warn("[tri-consensus] ABORT — only 1 source responded", {
      fecha: fechaISO,
      turno,
      survivor: survivor.name,
      duration: Date.now() - startTime,
    })
    return buildAbortResult("abort_no_quorum", nodes, quorum, `Only 1 source responded: ${survivor.name}`, startTime)
  }

  // CASE 4: 3 different values → anomaly, abort
  if (okCount === 3 && quorum.matchCount === 1) {
    const detail = nodes.map((n) => `${n.name}=cabeza:${n.cabeza}`).join(" vs ")
    logger.error("[tri-consensus] ABORT — 3 DIFFERENT VALUES (anomaly)", {
      fecha: fechaISO,
      turno,
      detail,
      duration: Date.now() - startTime,
    })
    return buildAbortResult("abort_no_quorum", nodes, quorum, `3 different values: ${detail}`, startTime)
  }

  // CASE 5: 0/3 or 2 disagree + 1 different → no quorum, abort
  {
    const detail = okCount === 0
      ? "All 3 sources failed"
      : `${quorum.matchCount}/${okCount} agreement — insufficient for quorum`
    logger.error("[tri-consensus] ABORT — NO QUORUM", {
      fecha: fechaISO,
      turno,
      okCount,
      matchCount: quorum.matchCount,
      duration: Date.now() - startTime,
    })
    return buildAbortResult("abort_no_quorum", nodes, quorum, detail, startTime)
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Result builders
// ══════════════════════════════════════════════════════════════════════════════

function buildResult(
  method: ConsensusResult["consensusMethod"],
  numbers: number[],
  source: string,
  nodes: SourceNode[],
  quorum: { matchCount: number; matchValue: number | null },
  startTime: number,
): ConsensusResult {
  return {
    ok: true,
    numbers,
    source,
    consensusMethod: method,
    nodes,
    quorum: { total: nodes.filter((n) => n.ok).length, matchCount: quorum.matchCount, matchValue: quorum.matchValue },
    duration: Date.now() - startTime,
  }
}

function buildAbortResult(
  method: ConsensusResult["consensusMethod"],
  nodes: SourceNode[],
  quorum: { matchCount: number; matchValue: number | null },
  divergenceDetails: string,
  startTime: number,
): ConsensusResult {
  return {
    ok: false,
    numbers: [],
    source: "none",
    consensusMethod: method,
    nodes,
    quorum: { total: nodes.filter((n) => n.ok).length, matchCount: quorum.matchCount, matchValue: quorum.matchValue },
    divergenceDetails,
    duration: Date.now() - startTime,
  }
}
