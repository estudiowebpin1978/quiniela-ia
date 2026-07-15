export interface ScrapeResult {
  numbers: number[]
  source: string
  cabezaMatch: boolean | null
}

export interface ParserFn {
  (fechaISO: string, fechaUrl: string, turno: string): Promise<ScrapeResult | null>
}

export interface SourceStats {
  [source: string]: { ok: number; fail: number }
}
