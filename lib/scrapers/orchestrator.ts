/**
 * Orchestrator: cascading fallback across 5 sources with retry + exponential backoff.
 *
 * Priority order:
 *   1. loteriadelaciudad.gob.ar  (official API)
 *   2. quinielanacional1.com.ar   (primary HTML)
 *   3. quinieleando.com.ar        (fallback HTML)
 *   4. ruta1000.com.ar            (fallback HTML - simple table)
 *   5. quiniela22.com             (cabeza cross-validation only)
 *
 * Each source is tried with up to 2 attempts (exponential backoff).
 * If a source returns < 20 numbers, cascade to the next.
 * Cabeza cross-validation is performed after obtaining 20 numbers.
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
  parseLoteriaOficial,
  parseQuinielaNacional1,
  parseQuinieleando,
  parseRuta1000,
  verifyCabeza,
} from "./parsers"
import logger from "@/lib/logger"

const FETCH_TIMEOUT = 8000
const MAX_RETRIES = 1
const BASE_DELAY = 2000

const PARSERS: { fn: ParserFn; name: string }[] = [
  { fn: parseLoteriaOficial, name: "loteria-ciudad.gob.ar" },
  { fn: parseQuinielaNacional1, name: "quinielanacional1.com.ar" },
  { fn: parseQuinieleando, name: "quinieleando.com.ar" },
  { fn: parseRuta1000, name: "ruta1000.com.ar" },
]

function track(stats: SourceStats, src: string, ok: boolean, duration: number): void {
  if (!stats[src]) stats[src] = { ok: 0, fail: 0, totalDuration: 0 }
  stats[src][ok ? "ok" : "fail"]++
  stats[src].totalDuration += duration
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Try a single parser with retry + exponential backoff.
 */
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

/**
 * Main orchestrator: try each source in priority order, return first valid 20-number result.
 * Performs cabeza cross-validation after obtaining results.
 */
export async function fetchWithFallback(
  fechaISO: string,
  fechaUrl: string,
  turno: TurnoType,
  stats: SourceStats,
  gameSlug: string = "quiniela"
): Promise<OrchestratorResult> {
  const overallStart = Date.now()
  const BUDGET = 25000
  const attempts: SourceAttempt[] = []

  for (const { fn, name } of PARSERS) {
    const budgetRemaining = BUDGET - (Date.now() - overallStart)
    if (budgetRemaining < 3000) {
      attempts.push({
        source: name,
        ok: false,
        duration: 0,
        numbersFound: 0,
        error: "budget exhausted",
      })
      break
    }

    const { result, attempt } = await tryParserWithRetry(
      fn,
      name,
      fechaISO,
      fechaUrl,
      turno,
      stats,
      budgetRemaining
    )
    attempts.push(attempt)

    if (result && result.numbers.length >= 20) {
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
          source: name,
          cabeza: result.numbers[0],
          game: gameSlug,
        })
      }

      logger.info("orchestrator: source succeeded", {
        fecha: fechaISO,
        turno,
        source: name,
        count: result.numbers.length,
        cabezaMatch,
        game: gameSlug,
        duration: Date.now() - overallStart,
      })

      return {
        numbers: result.numbers,
        source: name,
        cabezaMatch,
        duration: Date.now() - overallStart,
        attempts,
      }
    }
  }

  logger.warn("orchestrator: all sources failed", {
    fecha: fechaISO,
    turno,
    game: gameSlug,
    duration: Date.now() - overallStart,
    attempts: attempts.length,
  })

  return {
    numbers: [],
    source: "none",
    cabezaMatch: null,
    duration: Date.now() - overallStart,
    attempts,
  }
}
