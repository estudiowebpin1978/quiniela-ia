/**
 * Shared helpers for parsing prediction results from calculate_omega_v6 RPC.
 * Used by both GET and POST handlers in /api/predictions.
 */

export interface OmegaRow {
  numero: number
  prediccion_2cifras?: string
  prediccion_3cifras?: string[] | null
  prediccion_4cifras?: string[] | null
  redoblona?: { cabeza: string; acompanante: string } | null
  puntaje_total?: number
  factor_attribution?: Record<string, number>
}

/**
 * Parse prediccion_2cifras from the first RPC row (comma-separated string).
 * Falls back to individual rows sorted by puntaje_total if parsing fails.
 */
export function parsePred2(rows: OmegaRow[]): string[] {
  const firstRow = rows[0]
  const pred2: string[] = []
  if (firstRow?.prediccion_2cifras) {
    for (const n of firstRow.prediccion_2cifras.split(',')) {
      const trimmed = n.trim()
      if (trimmed) pred2.push(trimmed.padStart(2, '0'))
    }
  }
  if (pred2.length === 0) {
    const sorted = rows
      .filter((r) => (r.puntaje_total ?? 0) > 0)
      .sort((a, b) => (b.puntaje_total || 0) - (a.puntaje_total || 0))
    for (const r of sorted.slice(0, 10)) {
      pred2.push(String(r.numero).padStart(2, '0'))
    }
  }
  return pred2
}

/**
 * Extract 3 cifras from RPC rows (first row that has them).
 */
export function extractPred3(rows: OmegaRow[]): string[] {
  for (const r of rows) {
    if (r.prediccion_3cifras && Array.isArray(r.prediccion_3cifras) && r.prediccion_3cifras.length > 0) {
      return r.prediccion_3cifras.map((n: string) => n.padStart(3, '0'))
    }
  }
  return []
}

/**
 * Extract 4 cifras from RPC rows (first row that has them).
 */
export function extractPred4(rows: OmegaRow[]): string[] {
  for (const r of rows) {
    if (r.prediccion_4cifras && Array.isArray(r.prediccion_4cifras) && r.prediccion_4cifras.length > 0) {
      return r.prediccion_4cifras.map((n: string) => n.padStart(4, '0'))
    }
  }
  return []
}

/**
 * Extract redoblona from RPC rows (first row that has it).
 */
export function extractRedoblona(rows: OmegaRow[]): { cabeza: string; acompanante: string } | null {
  for (const r of rows) {
    if (r.redoblona && typeof r.redoblona === 'object' && r.redoblona.cabeza) {
      return r.redoblona
    }
  }
  return null
}
