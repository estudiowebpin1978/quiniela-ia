/**
 * Type definitions for the Quiniela scraping & ingestion pipeline.
 */

export const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as const
export type TurnoType = (typeof TURNOS)[number]

export const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"

export interface ScrapeResult {
  numbers: number[]
  source: string
  cabezaMatch: boolean | null
  duration: number
  retries: number
}

export interface DrawPayload {
  date: string
  turno: TurnoType
  numbers: number[]
  source: string
  game_id: string
}

export interface SourceStat {
  ok: number
  fail: number
  totalDuration: number
}

export type SourceStats = Record<string, SourceStat>

export interface ParserFn {
  (fechaISO: string, fechaUrl: string, turno: TurnoType): Promise<ScrapeResult | null>
}

export interface SourceAttempt {
  source: string
  ok: boolean
  duration: number
  numbersFound: number
  error?: string
}

export interface OrchestratorResult {
  numbers: number[]
  source: string
  cabezaMatch: boolean | null
  duration: number
  attempts: SourceAttempt[]
  consensusMethod?: "parallel_match" | "single_valid" | "tiebreak_majority" | "tiebreak_corroborated" | "tiebreak_independent" | "sequential_fallback"
}

export interface TurnoDetail {
  exists: boolean
  latest: string | null
  scraped: boolean
  source?: string
  numbersCount?: number
}

export interface SyncResult {
  synced: boolean
  newDraws: number
  validated: boolean
  errors: string[]
  lastDraw: { date: string; turno: string } | null
  duration: number
  details: Record<TurnoType, TurnoDetail>
}
