import { ScrapeResult, SourceStats, ParserFn } from "./types"
import { parseLoteriaOficial, parseQuinielaNacional1, parseQuinieleando, verifyCabeza } from "./parsers"
import logger from "@/lib/logger"

const FETCH_TIMEOUT = 8000

// Default parsers for quiniela (most common)
const PARSERS: { fn: ParserFn; name: string }[] = [
  { fn: parseQuinielaNacional1, name: "quinielanacional1.com.ar" },
  { fn: parseQuinieleando, name: "quinieleando.com.ar" },
  { fn: parseLoteriaOficial, name: "loteria-ciudad.gob.ar" },
]

// Game-specific parsers can be registered here
const GAME_PARSERS: Record<string, { fn: ParserFn; name: string }[]> = {}

interface OrchestratorResult {
  numbers: number[]
  source: string
  cabezaMatch: boolean | null
  gameSlug?: string
}

export async function fetchWithFallback(
  fechaISO: string,
  fechaUrl: string,
  turno: string,
  stats: SourceStats,
  gameSlug: string = 'quiniela'
): Promise<OrchestratorResult> {
  const parsers = GAME_PARSERS[gameSlug] || PARSERS
  
  const track = (src: string, ok: boolean) => {
    if (!stats[src]) stats[src] = { ok: 0, fail: 0 }
    stats[src][ok ? "ok" : "fail"]++
  }

  // Intentar cada fuente en orden de prioridad
  for (const { fn, name } of parsers) {
    try {
      const result = await Promise.race([
        fn(fechaISO, fechaUrl, turno),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
        )
      ])

      if (result && result.numbers.length >= 20) {
        // Cross-validate cabeza con quiniela22.com (only for quiniela)
        let cabezaMatch: boolean | null = null
        if (gameSlug === 'quiniela' && result.numbers.length > 0) {
          try {
            cabezaMatch = await verifyCabeza(fechaUrl, turno, result.numbers[0])
          } catch {}
        }

        if (cabezaMatch === false) {
          track(name, false)
          logger.warn("cron-scrape: cabeza mismatch, rechazando datos", {
            fecha: fechaISO, turno, source: name,
            cabeza: result.numbers[0], game: gameSlug
          })
          continue
        }

        track(name, true)
        logger.info("cron-scrape: fuente exitosa", {
          fecha: fechaISO, turno, source: name,
          count: result.numbers.length, cabezaMatch, game: gameSlug
        })

        return {
          numbers: result.numbers,
          source: name,
          cabezaMatch,
          gameSlug
        }
      }

      // Fuente devolvió datos insuficientes
      track(name, false)
      logger.debug("cron-scrape: fuente sin datos", { fecha: fechaISO, turno, source: name, game: gameSlug })
    } catch (e) {
      track(name, false)
      const errMsg = e instanceof Error ? e.message : String(e)
      logger.warn("cron-scrape: fuente falló", { fecha: fechaISO, turno, source: name, error: errMsg, game: gameSlug })
    }
  }

  // Todas las fuentes fallaron
  return { numbers: [], source: "none", cabezaMatch: null, gameSlug }
}

/**
 * Register a custom parser for a specific game.
 */
export function registerGameParser(gameSlug: string, fn: ParserFn, name: string): void {
  if (!GAME_PARSERS[gameSlug]) {
    GAME_PARSERS[gameSlug] = []
  }
  GAME_PARSERS[gameSlug].push({ fn, name })
}
