import { ScrapeResult, SourceStats, ParserFn } from "./types"
import { parseLoteriaOficial, parseQuinielaNacional1, parseQuinieleando, verifyCabeza } from "./parsers"
import logger from "@/lib/logger"

const FETCH_TIMEOUT = 8000

// Orden de prioridad: primaria → fallback 1 → fallback 2 → oficial
const PARSERS: { fn: ParserFn; name: string }[] = [
  { fn: parseQuinielaNacional1, name: "quinielanacional1.com.ar" },
  { fn: parseQuinieleando, name: "quinieleando.com.ar" },
  { fn: parseLoteriaOficial, name: "loteria-ciudad.gob.ar" },
]

interface OrchestratorResult {
  numbers: number[]
  source: string
  cabezaMatch: boolean | null
}

export async function fetchWithFallback(
  fechaISO: string,
  fechaUrl: string,
  turno: string,
  stats: SourceStats
): Promise<OrchestratorResult> {
  const track = (src: string, ok: boolean) => {
    if (!stats[src]) stats[src] = { ok: 0, fail: 0 }
    stats[src][ok ? "ok" : "fail"]++
  }

  // Intentar cada fuente en orden de prioridad
  for (const { fn, name } of PARSERS) {
    try {
      const result = await Promise.race([
        fn(fechaISO, fechaUrl, turno),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), FETCH_TIMEOUT)
        )
      ])

      if (result && result.numbers.length >= 5) {
        // Cross-validate cabeza con quiniela22.com
        let cabezaMatch: boolean | null = null
        if (result.numbers.length > 0) {
          try {
            cabezaMatch = await verifyCabeza(fechaUrl, turno, result.numbers[0])
          } catch {}
        }

        track(name, true)
        logger.info("cron-scrape: fuente exitosa", {
          fecha: fechaISO, turno, source: name,
          count: result.numbers.length, cabezaMatch
        })

        return {
          numbers: result.numbers,
          source: name,
          cabezaMatch
        }
      }

      // Fuente devolvió datos insuficientes
      track(name, false)
      logger.debug("cron-scrape: fuente sin datos", { fecha: fechaISO, turno, source: name })
    } catch (e) {
      track(name, false)
      const errMsg = e instanceof Error ? e.message : String(e)
      logger.warn("cron-scrape: fuente falló", { fecha: fechaISO, turno, source: name, error: errMsg })
    }
  }

  // Todas las fuentes fallaron
  return { numbers: [], source: "none", cabezaMatch: null }
}
