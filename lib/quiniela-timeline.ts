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
import { esDiaSinSorteo, esTurnoSinSorteo } from "@/lib/feriados"

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
 * - All other Ciudad turnos depend on today's previous turno
 * - Poceada es un juego separado que se resuelve con el ÚLTIMO Quiniela del
 *   día (Nocturna 21:00); su extracto oficial se publica en
 *   poceada.loteriadelaciudad.gob.ar → el pipeline no necesita esperar al
 *   sorteo de Quiniela para procesarla.
 */
export function getDependency(targetTurno: TurnoQuiniela): {
  turno: TurnoQuiniela
  dateOffset: number // 0 = today, -1 = yesterday
} | null {
  // Poceada: no prerequisite draw needed (official extract published on its own site)
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
export function dateART(offset: number = 0, ref: Date = new Date()): string {
  // Get current date in Buenos Aires by formatting then parsing
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  })
  const todayArt = formatter.format(ref)
  // Parse as UTC date components to avoid timezone drift
  const [y, m, d] = todayArt.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + offset))
  // FIX 2026-10-14 (off-by-one real): dt YA es el día calendario pedido
  // (medianoche UTC). Antes se formateaba CON tz ART (UTC−3), lo que corría
  // la fecha un día atrás — dateART(-1) devolvía hace DOS días. Consecuencia
  // en prod: la cadena de dependencias de cron-run esperaba el "Nocturna" de
  // un domingo (10-11) y un feriado (10-12) que nunca existirán, y
  // predictions_cache quedó bloqueada en el 10-10 para los 5 turnos nacionales.
  return dt.toISOString().slice(0, 10)
}

/** Día de la semana (0=domingo) de una fecha "YYYY-MM-DD" como dato calendario. */
function weekdayDeFecha(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** Suma días calendario a una fecha "YYYY-MM-DD" (aritmética UTC pura). */
function agregarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + dias)).toISOString().slice(0, 10)
}

/**
 * Resuelve la expectativa REAL de una dependencia de la cadena de predicción.
 *
 * Sin esto la cadena se bloqueaba para siempre tras días sin sorteo: esperaba
 * el sorteo de una fecha calendario que nunca existirá (domingo/feriado) y ni
 * cron-run ni auto-predict volvían a calcular.
 *
 * - Días calendario sin sorteo (domingos y feriados, `esDiaSinSorteo`): camina
 *   hacia atrás hasta el último día con sorteo (ej. desde 10-13: espera
 *   Nocturna del 10-12 feriado → 10-11 domingo → 10-10 sábado ✓).
 * - Turno suspendido ese día (feriados parciales 24/12 y 31/12, ver
 *   `esTurnoSinSorteo`): el prerequisite baja al turno anterior más reciente
 *   que sí se sortea ese día (Matutina y Vespertina suspendidas → Primera).
 */
export function resolverDependencia(
  dep: { turno: TurnoQuiniela; dateOffset: number },
  ref: Date = new Date(),
): { turno: TurnoQuiniela; fecha: string } {
  let fecha = dateART(dep.dateOffset, ref)
  let turno = dep.turno

  for (let i = 0; i < 30 && esDiaSinSorteo(fecha, weekdayDeFecha(fecha)); i++) {
    fecha = agregarDias(fecha, -1)
  }

  for (let i = 0; i < TURNOS_ORDER.length && esTurnoSinSorteo(fecha, turno); i++) {
    const idx = TURNOS_ORDER.indexOf(turno)
    if (idx <= 0) break // Previa nunca está suspendida: piso del bucle
    turno = TURNOS_ORDER[idx - 1]
  }

  return { turno, fecha }
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

  // Poceada: no prerequisite — find its latest draw
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

  // Expectativa real: salta días sin sorteo y turnos suspendidos
  // (ver resolverDependencia — sin esto quedaba bloqueada tras domingos/feriados)
  const { turno: depTurno, fecha: expectedDate } = resolverDependencia(dep)

  const { data: draw } = await supabase
    .from("draws")
    .select("id, turno, date, created_at")
    .eq("turno", depTurno)
    .eq("date", expectedDate)
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  if (!draw) {
    return {
      valid: false,
      reason: `Missing draw: ${depTurno} for ${expectedDate}`,
      expected: { turno: depTurno, date: expectedDate },
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
      expected: { turno: depTurno, date: expectedDate },
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
      expected: { turno: depTurno, date: expectedDate },
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
