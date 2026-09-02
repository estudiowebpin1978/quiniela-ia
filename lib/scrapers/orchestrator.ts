/**
 * Orchestrator: parallel consensus across sources with fallback.
 *
 * Priority order:
 *   1. quinieleando.com.ar       (static HTML, all turnos — PRIMARY)
 *   2. loteria-ciudad.gob.ar     (official CABA AJAX)
 *   3. quinielanacionaln.com.ar  (HTTP homepage, all turnos — FALLBACK)
 *
 * Strategy:
 *   - Sources 1 & 2 run in parallel (Promise.allSettled).
 *   - First successful result with >= 20 numbers wins.
 *   - Both fail → sequential fallback to source 3.
 *   - Date validation: parsers reject data from wrong dates.
 */

import {
  ScrapeResult,
  SourceStats,
  SourceAttempt,
  OrchestratorResult,
  ParserFn,
  TurnoType,
} from "./types"
import {
  parseOficial,
  parseQuinieleando,
  parseLoteriaOficial,
  parseQuinielaNacionalN,
  parseNacionalQuiniela,
  parseNumerosEnvivo,
  parseLoteriaMundiales,
  verifyCabeza,
} from "./parsers"
import { isSourceQuarantined, recordSourceResult } from "./circuit-breaker"
import logger from "@/lib/logger"

const FETCH_TIMEOUT = 6000
const MAX_RETRIES = 1
const BASE_DELAY = 2000
const TOP_N_CONSENSUS = 5

const PARSERS: { fn: ParserFn; name: string }[] = [
  { fn: parseOficial, name: "quiniela.loteriadelaciudad.gob.ar" },
  { fn: parseQuinieleando, name: "quinieleando.com.ar" },
  { fn: parseNumerosEnvivo, name: "numerosenvivo.com.ar" },
  { fn: parseLoteriaMundiales, name: "loteriasmundiales.com.ar" },
  { fn: parseLoteriaOficial, name: "loteria-ciudad.gob.ar" },
  { fn: parseQuinielaNacionalN, name: "quinielanacionaln.com.ar" },
  { fn: parseNacionalQuiniela, name: "nacionalquiniela.com" },
]

function track(stats: SourceStats, src: string, ok: boolean, duration: number): void {
  if (!stats[src]) stats[src] = { ok: 0, fail: 0, totalDuration: 0 }
  stats[src][ok ? "ok" : "fail"]++
  stats[src].totalDuration += duration
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

// ── Consensus helpers ──────────────────────────────────────────────────────

export function compareTopN(a: number[], b: number[], n: number = TOP_N_CONSENSUS): { match: boolean; matchedCount: number; details: string } {
  const sliceA = a.slice(0, n)
  const sliceB = b.slice(0, n)
  let matched = 0
  for (let i = 0; i < n; i++) {
    if (sliceA[i] === sliceB[i]) matched++
  }
  return {
    match: matched >= n,
    matchedCount: matched,
    details: `top-${n}: [${sliceA}] vs [${sliceB}] → ${matched}/${n} match`,
  }
}

// ── Single parser with retry ───────────────────────────────────────────────

async function tryParserWithRetry(
  fn: ParserFn,
  name: string,
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
  budgetRemaining: number
): Promise<{ result: ScrapeResult | null; attempt: SourceAttempt }> {
  // ── Circuit breaker: skip quarantined sources ──
  const breakerState = await isSourceQuarantined(name)
  if (breakerState.isQuarantined) {
    logger.info("orchestrator: source quarantined, skipping", {
      source: name,
      quarantinedUntil: breakerState.quarantinedUntil?.toISOString(),
      consecutiveFailures: breakerState.consecutiveFailures,
    })
    return {
      result: null,
      attempt: {
        source: name,
        ok: false,
        duration: 0,
        numbersFound: 0,
        error: `quarantined (failures: ${breakerState.consecutiveFailures})`,
      },
    }
  }

  let lastError = ""
  const attempts: number = MAX_RETRIES + 1
  let lastSuccess = false

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = BASE_DELAY * Math.pow(2, attempt - 1)
      if (backoff > budgetRemaining) break
      await delay(backoff)
    }

    const attemptStart = Date.now()
    try {
      const result = await Promise.race([
        fn(fechaISO, fechaUrl, turno),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
        ),
      ])

      const attemptDuration = Date.now() - attemptStart

      if (result && result.numbers.length >= 20) {
        track(stats, name, true, attemptDuration)
        lastSuccess = true
        // Record success (resets consecutive failures)
        await recordSourceResult(name, true)
        return {
          result,
          attempt: {
            source: name,
            ok: true,
            duration: attemptDuration,
            numbersFound: result.numbers.length,
          },
        }
      }

      lastError = result
        ? `insufficient numbers: ${result.numbers.length}`
        : "no data"
      track(stats, name, false, attemptDuration)
    } catch (e) {
      const attemptDuration = Date.now() - attemptStart
      lastError = e instanceof Error ? e.message : String(e)
      track(stats, name, false, attemptDuration)
    }
  }

  // Record failure (increments consecutive failures)
  if (!lastSuccess) {
    await recordSourceResult(name, false)
  }

  return {
    result: null,
    attempt: {
      source: name,
      ok: false,
      duration: 0,
      numbersFound: 0,
      error: lastError,
    },
  }
}

// ── Parallel fetch (first 2 sources) ──────────────────────────────────────

async function runParsersParallel(
  parsers: { fn: ParserFn; name: string }[],
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
  budgetRemaining: number
): Promise<{ results: (ScrapeResult | null)[]; attempts: SourceAttempt[] }> {
  const start = Date.now()

  const settled = await Promise.allSettled(
    parsers.map(({ fn, name }) =>
      tryParserWithRetry(fn, name, fechaISO, fechaUrl, turno, stats, budgetRemaining)
    )
  )

  const results: (ScrapeResult | null)[] = []
  const attempts: SourceAttempt[] = []

  for (let i = 0; i < settled.length; i++) {
    const outcome = settled[i]
    if (outcome.status === "fulfilled") {
      results.push(outcome.value.result)
      attempts.push(outcome.value.attempt)
    } else {
      results.push(null)
      attempts.push({
        source: parsers[i].name,
        ok: false,
        duration: Date.now() - start,
        numbersFound: 0,
        error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
      })
    }
  }

  return { results, attempts }
}

// ── Cabeza cross-validation ────────────────────────────────────────────────

async function validateCabeza(
  result: ScrapeResult,
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  sourceName: string,
  gameSlug: string,
  totalAttempts: SourceAttempt[]
): Promise<OrchestratorResult> {
  let cabezaMatch: boolean | null = null
  if (gameSlug === "quiniela" && result.numbers.length > 0) {
    try {
      cabezaMatch = await verifyCabeza(fechaUrl, turno, result.numbers[0])
    } catch {
      // Cross-validation failure is non-fatal
    }
  }

  if (cabezaMatch === false) {
    logger.warn("orchestrator: cabeza mismatch, treating as non-fatal", {
      fecha: fechaISO,
      turno,
      source: sourceName,
      cabeza: result.numbers[0],
      game: gameSlug,
    })
  }

  return {
    numbers: result.numbers,
    source: sourceName,
    cabezaMatch,
    duration: 0, // caller fills
    attempts: totalAttempts,
  }
}

// ── Main orchestrator ──────────────────────────────────────────────────────

export async function fetchWithFallback(
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
  gameSlug: string = "quiniela"
): Promise<OrchestratorResult> {
  const overallStart = Date.now()
  const BUDGET = 20000
  const allAttempts: SourceAttempt[] = []

  // ── Step 1: Parallel fetch — first 4 sources ──────────────────────────
  const parallelParsers = PARSERS.slice(0, 4)
  const budgetStep1 = BUDGET - (Date.now() - overallStart)

  logger.info("orchestrator: parallel fetch started", {
    fecha: fechaISO,
    turno,
    sources: parallelParsers.map(p => p.name),
  })

  const { results: parallelResults, attempts: parallelAttempts } = await runParsersParallel(
    parallelParsers,
    fechaISO,
    fechaUrl,
    turno,
    stats,
    budgetStep1
  )
  allAttempts.push(...parallelAttempts)

  // Find all successful results (>= 20 numbers)
  const successfulResults: { idx: number; result: ScrapeResult; name: string }[] = []
  for (let i = 0; i < parallelResults.length; i++) {
    const r = parallelResults[i]
    if (r !== null && r.numbers.length >= 20) {
      successfulResults.push({ idx: i, result: r, name: parallelParsers[i].name })
    }
  }

  // ── At least 2 succeeded: check consensus ─────────────────────────────
  if (successfulResults.length >= 2) {
    for (let i = 0; i < successfulResults.length; i++) {
      for (let j = i + 1; j < successfulResults.length; j++) {
        const comparison = compareTopN(successfulResults[i].result.numbers, successfulResults[j].result.numbers)
        if (comparison.match) {
          logger.info("orchestrator: parallel consensus", {
            fecha: fechaISO,
            turno,
            src1: successfulResults[i].name,
            src2: successfulResults[j].name,
            comparison: comparison.details,
            duration: Date.now() - overallStart,
          })
          const result = await validateCabeza(successfulResults[i].result, fechaISO, fechaUrl, turno, successfulResults[i].name, gameSlug, allAttempts)
          result.duration = Date.now() - overallStart
          result.consensusMethod = "parallel_match"
          return result
        }
      }
    }

    // No consensus: use tiebreaker sources (4-6)
    logger.warn("orchestrator: parallel divergence, trying tiebreakers", {
      fecha: fechaISO,
      turno,
      successful: successfulResults.map(r => r.name),
    })

    const tiebreakers = PARSERS.slice(4)
    const budgetStep2 = BUDGET - (Date.now() - overallStart)

    if (budgetStep2 >= 3000) {
      for (const tiebreaker of tiebreakers) {
        const { result: res3, attempt: attempt3 } = await tryParserWithRetry(
          tiebreaker.fn, tiebreaker.name, fechaISO, fechaUrl, turno, stats, budgetStep2
        )
        allAttempts.push(attempt3)

        if (res3 !== null && res3.numbers.length >= 20) {
          let bestMatch = successfulResults[0]
          let bestScore = -1
          for (const sr of successfulResults) {
            const cmp = compareTopN(res3.numbers, sr.result.numbers)
            if (cmp.matchedCount > bestScore) {
              bestScore = cmp.matchedCount
              bestMatch = sr
            }
          }

          // Always prefer the parallel source's data — tiebreaker only validates, never overrides
          const bestResult = bestMatch.result

          logger.info("orchestrator: tiebreak result", {
            fecha: fechaISO, turno, tiebreaker: tiebreaker.name,
            matchWith: bestMatch.name, matchScore: bestScore,
            duration: Date.now() - overallStart,
          })

          const result = await validateCabeza(bestResult, fechaISO, fechaUrl, turno, bestMatch.name, gameSlug, allAttempts)
          result.duration = Date.now() - overallStart
          result.consensusMethod = bestScore >= 3 ? "tiebreak_corroborated" : "tiebreak_independent"
          return result
        }
      }
    }

    const winner = successfulResults[0]
    const result = await validateCabeza(winner.result, fechaISO, fechaUrl, turno, winner.name, gameSlug, allAttempts)
    result.duration = Date.now() - overallStart
    result.consensusMethod = "single_valid"
    return result
  }

  // ── Exactly 1 succeeded: use it ──────────────────────────────────────
  if (successfulResults.length === 1) {
    const winner = successfulResults[0]
    logger.info("orchestrator: single valid", {
      fecha: fechaISO, turno, source: winner.name,
      duration: Date.now() - overallStart,
    })
    const result = await validateCabeza(winner.result, fechaISO, fechaUrl, turno, winner.name, gameSlug, allAttempts)
    result.duration = Date.now() - overallStart
    result.consensusMethod = "single_valid"
    return result
  }

  // ── All failed: sequential fallback to remaining sources ──────────────
  logger.warn("orchestrator: parallel failed, trying fallback sources", {
    fecha: fechaISO,
    turno,
    reason: "all parallel sources failed",
  })

  for (let i = 4; i < PARSERS.length; i++) {
    const fallback = PARSERS[i]
    const fallbackAttempt: SourceAttempt = { source: fallback.name, ok: false, error: undefined, duration: 0, numbersFound: 0 }
    try {
      const fbStart = Date.now()
      const { result: fbResult, attempt: fbAttempt } = await tryParserWithRetry(fallback.fn, fallback.name, fechaISO, fechaUrl, turno, stats, 10000)
      fallbackAttempt.duration = Date.now() - fbStart
      fallbackAttempt.error = fbAttempt.error
      allAttempts.push(fallbackAttempt)

      if (fbResult && fbResult.numbers.length >= 20) {
        fallbackAttempt.ok = true
        logger.info("orchestrator: fallback succeeded", {
          fecha: fechaISO, turno, source: fallback.name,
          numbers: fbResult.numbers.length, duration: fallbackAttempt.duration,
        })
        const result = await validateCabeza(fbResult, fechaISO, fechaUrl, turno, fallback.name, gameSlug, allAttempts)
        result.duration = Date.now() - overallStart
        result.consensusMethod = "sequential_fallback"
        return result
      }
      fallbackAttempt.error = fbAttempt.error || "insufficient data"
    } catch (e) {
      fallbackAttempt.error = String(e)
      allAttempts.push(fallbackAttempt)
    }
  }

  // ── All sources exhausted ─────────────────────────────────────────────
  logger.warn("orchestrator: all sources failed", {
    fecha: fechaISO,
    turno,
    game: gameSlug,
    duration: Date.now() - overallStart,
    attempts: allAttempts.length,
    attemptSummary: allAttempts.map(a => `${a.source}:${a.ok ? "ok" : "fail"}`),
  })

  return {
    numbers: [],
    source: "none",
    cabezaMatch: null,
    duration: Date.now() - overallStart,
    attempts: allAttempts,
    consensusMethod: "sequential_fallback",
  }
}
