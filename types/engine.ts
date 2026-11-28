/**
 * Engine Context — Makes all engines pure functions.
 *
 * For the same (lastDrawId, targetTurn), engines always return
 * the same result regardless of when or where they run.
 *
 * This eliminates:
 * - Timezone bugs (Vercel UTC vs Argentina ART)
 * - Race conditions (scrape delays)
 * - Non-determinism (Math.random, Date.now())
 */

export type TurnoQuiniela = "Previa" | "Primera" | "Matutina" | "Vespertina" | "Nocturna"

export const TURNOS: TurnoQuiniela[] = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

export const TURNO_INDEX: Record<TurnoQuiniela, number> = {
  Previa: 0,
  Primera: 1,
  Matutina: 2,
  Vespertina: 3,
  Nocturna: 4,
}

/**
 * EngineContext — The "snapshot of reality" that all engines receive.
 *
 * @property lastDrawId - The ID of the most recent draw in the database.
 *   Engines use this to scope their history: `WHERE id <= lastDrawId`.
 *   If the scraper hasn't run yet, this is the previous turno's draw.
 *
 * @property targetTurn - Which turno we're predicting for.
 *   Engines use this to filter history and apply turno-specific weights.
 */
export interface EngineContext {
  lastDrawId: number
  targetTurn: TurnoQuiniela
}

/**
 * Build EngineContext from the database.
 * Returns null if no draws exist.
 */
export async function buildEngineContext(
  supabase: { from: (table: string) => { select: (cols: string) => { order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => { single: () => Promise<{ data: Record<string, unknown> | null }> } } } } },
  targetTurn: TurnoQuiniela,
): Promise<EngineContext | null> {
  const { data: lastDraw } = await supabase
    .from("draws")
    .select("id")
    .order("id", { ascending: false })
    .limit(1)
    .single()

  if (!lastDraw) return null

  return {
    lastDrawId: lastDraw.id as number,
    targetTurn,
  }
}

/**
 * Deterministic seed from context.
 * Same context → same seed → same perturbation.
 */
export function contextSeed(ctx: EngineContext): number {
  let hash = 0
  const str = `${ctx.lastDrawId}-${ctx.targetTurn}`
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}
