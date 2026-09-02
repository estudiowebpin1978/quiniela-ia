/**
 * ScraperStrategy — modular interface for each scraping source.
 *
 * Each source implements this interface independently.
 * The consensus algorithm never touches source-specific parsing logic.
 */

import type { TurnoType, ScrapeResult } from "./types"

export interface ScraperStrategy {
  /** Unique source identifier (used in logs + circuit breaker) */
  readonly name: string

  /** Human-readable URL for debugging */
  readonly baseUrl: string

  /**
   * Fetch and parse results from this source.
   * Returns null if the source is unavailable or returns insufficient data.
   * Must complete within the timeout budget (enforced by caller).
   */
  fetch(fechaISO: string, fechaUrl: string, turno: TurnoType): Promise<ScrapeResult | null>
}
