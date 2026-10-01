/**
 * Quiniela Timeline — Turno dependency map and strict validation.
 *
 * Each turno depends on the previous turno's draw being scraped first.
 * If the dependency isn't met, auto-predict ABORTS (425 Too Early).
 *
 * This prevents the silent race condition where auto-predict runs
 * with stale data because the scraper hasn't finished yet.
 */

import type { TurnoQuiniela } from "@/types/engine"

export const TURNOS_ORDER: TurnoQuiniela[] = [
  "Previa",
  "Primera",
  "Matutina",
  "Vespertina",
  "Nocturna",
  "Poceada",
]

/**
 * What draw MUST exist in the database before we can predict `targetTurno`.
 *
 * - Previa depends on yesterday's Nocturna (last draw of previous day)
 * - All other Nacional turnos depend on today's previous turno
 * - Poceada is independent (separate game, no Nacional dependency)
 */
export function getDependency(targetTurno: TurnoQuiniela): {
  turno: TurnoQuiniela
  dateOffset: number // 0 = today, -1 = yesterday
} | null {
  // Poceada is independent — no prerequisite draw needed
  if (targetTurno === "Poceada") {
    return null
  }
  const idx = TURNOS_ORDER.indexOf(targetTurno)
  if (idx <= 0) {
    // Previa depends on yesterday's Nocturna
    return { turno: "Nocturna", dateOffset: -1 }
  }
  // All others depend on today's previous turno
  return { turno: TURNOS_ORDER[idx - 1], dateOffset: 0 }
}

/**
 * Get today's date string in ART timezone (YYYY-MM-DD).
 */
export function todayART(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  }).format()
}

/**
 * Get date string with offset in ART timezone.
 * offset=0 → today, offset=-1 → yesterday
 */
export function dateART(offset: number = 0): string {
  // Get current date in Buenos Aires by formatting then parsing
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
  const todayArt = formatter.format(new Date())
  // Parse as UTC date components to avoid timezone drift
  const [y, m, d] = todayArt.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset))
  return formatter.format(dt)
}

/**
 * Validate that the prerequisite draw exists in the database.
 * Returns { valid: true, lastDrawId } or { valid: false, reason }.
 */
export async function validatePrerequisite(
   
  supabase: any,
  targetTurno: TurnoQuiniela,
): Promise<
  | { valid: true; lastDrawId: string }
  | { valid: false; reason: string; expected: { turno: string; date: string }; found: { turno: string; date: string; id: string } | null }
> {
  const dep = getDependency(targetTurno)

  // Poceada is independent — no prerequisite needed, just find its latest draw
  if (!dep) {
    const { data: latestDraw } = await supabase
      .from("draws")
      .select("id, turno, date")
      .eq("turno", targetTurno)
      .order("date", { ascending: false })
      .limit(1)
      .single()

    if (!latestDraw) {
      return {
        valid: false,
        reason: `No draws found for ${targetTurno}`,
        expected: { turno: targetTurno, date: "any" },
        found: null,
      }
    }

    return { valid: true, lastDrawId: latestDraw.id }
  }

  const expectedDate = dateART(dep.dateOffset)

  const { data: draw } = await supabase
    .from("draws")
    .select("id, turno, date, created_at")
    .eq("turno", dep.turno)
    .eq("date", expectedDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!draw) {
    return {
      valid: false,
      reason: `Missing draw: ${dep.turno} for ${expectedDate}`,
      expected: { turno: dep.turno, date: expectedDate },
      found: null,
    }
  }

  const { data: latestDraw } = await supabase
    .from("draws")
    .select("id, turno, date, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!latestDraw) {
    return {
      valid: false,
      reason: "No draws in database",
      expected: { turno: dep.turno, date: expectedDate },
      found: null,
    }
  }

  // Compare by created_at — UUIDs cannot be compared numerically
  const latestTime = new Date(latestDraw.created_at).getTime()
  const depTime = new Date(draw.created_at || "1970-01-01").getTime()

  if (latestTime < depTime) {
    return {
      valid: false,
      reason: `Latest draw (${latestDraw.turno} ${latestDraw.date}) is older than dependency (${draw.turno} ${draw.date})`,
      expected: { turno: dep.turno, date: expectedDate },
      found: { turno: latestDraw.turno as string, date: latestDraw.date as string, id: latestDraw.id as string },
    }
  }

  return { valid: true, lastDrawId: latestDraw.id as string }
}

/**
 * Get the next turno to predict after a given turno.
 * Returns null if there's no next turno (end of day).
 */
export function getNextTurno(currentTurno: TurnoQuiniela): TurnoQuiniela | null {
  const idx = TURNOS_ORDER.indexOf(currentTurno)
  if (idx < 0 || idx >= TURNOS_ORDER.length - 1) return null
  return TURNOS_ORDER[idx + 1]
}

/**
 * After scraping `scrapedTurno`, which turno should we predict next?
 * Returns the target turno + date offset (0=today, 1=tomorrow).
 * Example: scrapedTurno="Vespertina" → { turno: "Nocturna", dateOffset: 0 }
 *          scrapedTurno="Nocturna" → { turno: "Previa", dateOffset: 1 }
 */
export function getNextToPredictAfter(scrapedTurno: TurnoQuiniela): {
  turno: TurnoQuiniela
  dateOffset: number
} | null {
  const next = getNextTurno(scrapedTurno)
  if (next) return { turno: next, dateOffset: 0 }
  // Nocturna scraped → Previa tomorrow
  if (scrapedTurno === "Nocturna") return { turno: "Previa", dateOffset: 1 }
  return null
}

/**
 * Check if a turno's draw time has passed (in ART).
 * Used to determine if a scrape should have happened by now.
 */
export function hasTurnoTimePassed(currentTurno: TurnoQuiniela): boolean {
  const art = new Date().toLocaleString("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  const [h, m] = art.split(":").map(Number)
  const nowDecimal = h + m / 60

  const turnoTimes: Record<string, number> = {
    Previa: 10.25,
    Primera: 12.0,
    Matutina: 15.0,
    Vespertina: 18.0,
    Nocturna: 21.0,
  }

  return nowDecimal >= (turnoTimes[currentTurno] || 0)
}
