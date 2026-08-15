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
  parseQuinieleando,
  parseLoteriaOficial,
  parseQuinielaNacionalN,
  verifyCabeza,
} from "./parsers"
import logger from "@/lib/logger"

const FETCH_TIMEOUT = 8000
const MAX_RETRIES = 1
const BASE_DELAY = 2000
const TOP_N_CONSENSUS = 5

const PARSERS: { fn: ParserFn; name: string }[] = [
  { fn: parseQuinieleando, name: "quinieleando.com.ar" },
  { fn: parseLoteriaOficial, name: "loteria-ciudad.gob.ar" },
  { fn: parseQuinielaNacionalN, name: "quinielanacionaln.com.ar" },
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

function compareTopN(a: number[], b: number[], n: number = TOP_N_CONSENSUS): { match: boolean; matchedCount: number; details: string } {
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
  let lastError = ""
  const attempts: number = MAX_RETRIES + 1

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
  const BUDGET = 25000
  const allAttempts: SourceAttempt[] = []

  // ── Step 1: Parallel fetch — sources 1 & 2 ────────────────────────────
  const [primary, secondary] = PARSERS.slice(0, 2)
  const budgetStep1 = BUDGET - (Date.now() - overallStart)

  logger.info("orchestrator: parallel fetch started", {
    fecha: fechaISO,
    turno,
    sources: [primary.name, secondary.name],
  })

  const { results: parallelResults, attempts: parallelAttempts } = await runParsersParallel(
    [primary, secondary],
    fechaISO,
    fechaUrl,
    turno,
    stats,
    budgetStep1
  )
  allAttempts.push(...parallelAttempts)

  const [res1, res2] = parallelResults
  const ok1 = res1 !== null && res1.numbers.length >= 20
  const ok2 = res2 !== null && res2.numbers.length >= 20

  // ── Both succeeded: check consensus ──────────────────────────────────
  if (ok1 && ok2) {
    const comparison = compareTopN(res1!.numbers, res2!.numbers)

    if (comparison.match) {
      // Fast path: parallel consensus
      logger.info("orchestrator: parallel consensus", {
        fecha: fechaISO,
        turno,
        src1: primary.name,
        src2: secondary.name,
        comparison: comparison.details,
        duration: Date.now() - overallStart,
      })

      const result = await validateCabeza(res1!, fechaISO, fechaUrl, turno, primary.name, gameSlug, allAttempts)
      result.duration = Date.now() - overallStart
      result.consensusMethod = "parallel_match"
      return result
    }

    // Divergence: need tiebreaker
    logger.warn("orchestrator: parallel divergence", {
      fecha: fechaISO,
      turno,
      src1: primary.name,
      src2: secondary.name,
      comparison: comparison.details,
      action: "tiebreak",
    })

    // ── Step 2: Tiebreaker — source 3 ──────────────────────────────────
    const tiebreaker = PARSERS[2]
    const budgetStep2 = BUDGET - (Date.now() - overallStart)

    if (budgetStep2 >= 3000) {
      const { result: res3, attempt: attempt3 } = await tryParserWithRetry(
        tiebreaker.fn,
        tiebreaker.name,
        fechaISO,
        fechaUrl,
        turno,
        stats,
        budgetStep2
      )
      allAttempts.push(attempt3)

      const ok3 = res3 !== null && res3.numbers.length >= 20

      if (ok3) {
        const cmp3v1 = compareTopN(res3!.numbers, res1!.numbers)
        const cmp3v2 = compareTopN(res3!.numbers, res2!.numbers)

        // Majority: tiebreaker matches source 1 → source 1 wins
        //            tiebreaker matches source 2 → source 2 wins
        //            neither matches → source 1 wins (original priority)
        const matchedSource = cmp3v1.matchedCount >= cmp3v2.matchedCount ? primary : secondary
        const matchedResult = cmp3v1.matchedCount >= cmp3v2.matchedCount ? res1! : res2!

        logger.info("orchestrator: tiebreak result", {
          fecha: fechaISO,
          turno,
          tiebreaker: tiebreaker.name,
          tiebreakerTop5: res3!.numbers.slice(0, 5),
          src1Top5: res1!.numbers.slice(0, 5),
          src2Top5: res2!.numbers.slice(0, 5),
          matchWith: matchedSource.name,
          matchScore: Math.max(cmp3v1.matchedCount, cmp3v2.matchedCount),
          decision: `majority → ${matchedSource.name}`,
          duration: Date.now() - overallStart,
        })

        const result = await validateCabeza(matchedResult, fechaISO, fechaUrl, turno, matchedSource.name, gameSlug, allAttempts)
        result.duration = Date.now() - overallStart
        result.consensusMethod = "tiebreak_majority"
        return result
      }

      // Tiebreaker failed to return valid data — fall back to source 1
      logger.warn("orchestrator: tiebreaker failed, falling back to source 1", {
        fecha: fechaISO,
        turno,
        tiebreaker: tiebreaker.name,
        error: attempt3.error,
      })
    }

    // Fallback: source 1 wins by priority
    const result = await validateCabeza(res1!, fechaISO, fechaUrl, turno, primary.name, gameSlug, allAttempts)
    result.duration = Date.now() - overallStart
    result.consensusMethod = "single_valid"
    return result
  }

  // ── One succeeded: use it directly ────────────────────────────────────
  if (ok1) {
    logger.info("orchestrator: single valid (only primary)", {
      fecha: fechaISO,
      turno,
      source: primary.name,
      duration: Date.now() - overallStart,
    })

    const result = await validateCabeza(res1!, fechaISO, fechaUrl, turno, primary.name, gameSlug, allAttempts)
    result.duration = Date.now() - overallStart
    result.consensusMethod = "single_valid"
    return result
  }

  if (ok2) {
    logger.info("orchestrator: single valid (only secondary)", {
      fecha: fechaISO,
      turno,
      source: secondary.name,
      duration: Date.now() - overallStart,
    })

    const result = await validateCabeza(res2!, fechaISO, fechaUrl, turno, secondary.name, gameSlug, allAttempts)
    result.duration = Date.now() - overallStart
    result.consensusMethod = "single_valid"
    return result
  }

  // ── Both failed: sequential fallback to source 3 ──────────────────────
  logger.warn("orchestrator: parallel failed, sequential fallback", {
    fecha: fechaISO,
    turno,
    reason: "both parallel sources failed",
    src1Attempt: parallelAttempts[0],
    src2Attempt: parallelAttempts[1],
  })

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
