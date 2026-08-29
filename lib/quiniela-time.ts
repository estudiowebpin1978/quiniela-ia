/**
 * Quiniela Time Utilities
 *
 * All time logic runs in ART (Argentina Time = UTC-3).
 * Guarantees correct turno scheduling regardless of server timezone.
 */

/** Official turno schedule in ART */
export const TURNO_SCHEDULE: Record<string, { artHour: number; artMinute: number }> = {
  Previa:     { artHour: 10, artMinute: 15 },
  Primera:    { artHour: 12, artMinute: 0  },
  Matutina:   { artHour: 15, artMinute: 0  },
  Vespertina: { artHour: 18, artMinute: 0  },
  Nocturna:   { artHour: 21, artMinute: 0  },
}

export const ALL_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"] as const
export type TurnoName = (typeof ALL_TURNOS)[number]

/**
 * Get the current date/time components in ART timezone.
 */
export function getCurrentART(): {
  date: Date
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number // 0=Sun, 6=Sat
  dateStr: string // "YYYY-MM-DD"
  timeDecimal: number // hours + minutes/60 (e.g. 14.5 = 14:30)
} {
  const now = new Date()
  const artStr = now.toLocaleString("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

  // Parse "MM/DD/YYYY, HH:MM" format
  const [datePart, timePart] = artStr.split(", ")
  const [month, day, year] = datePart.split("/").map(Number)
  const [hour, minute] = timePart.split(":").map(Number)

  // Build date in ART for weekday
  const artDate = new Date(year, month - 1, day, hour, minute)

  return {
    date: artDate,
    year,
    month,
    day,
    hour,
    minute,
    weekday: artDate.getDay(),
    dateStr: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    timeDecimal: hour + minute / 60,
  }
}

/**
 * Get the official date string for a turno in ART.
 * Nocturna after midnight uses previous day's date (it belongs to yesterday's game).
 */
export function getTurnoDate(turno: TurnoName, artNow?: ReturnType<typeof getCurrentART>): string {
  const art = artNow || getCurrentART()

  // Nocturna at 21:00 uses the current date
  // But if called after midnight (00:00-05:00), it still belongs to yesterday
  if (turno === "Nocturna" && art.hour < 6) {
    const yesterday = new Date(art.date)
    yesterday.setDate(yesterday.getDate() - 1)
    const y = yesterday.getFullYear()
    const m = String(yesterday.getMonth() + 1).padStart(2, "0")
    const d = String(yesterday.getDate()).padStart(2, "0")
    return `${y}-${m}-${d}`
  }

  return art.dateStr
}

/**
 * Returns the list of turnos whose official time has already passed today.
 * Respects Saturday rules (no Previa/Primera on Saturdays).
 */
export function getAvailableTurnos(artNow?: ReturnType<typeof getCurrentART>): TurnoName[] {
  const art = artNow || getCurrentART()
  const result: TurnoName[] = []

  for (const turno of ALL_TURNOS) {
    // Skip Saturday Previa/Primera
    if (art.weekday === 6 && (turno === "Previa" || turno === "Primera")) continue

    const schedule = TURNO_SCHEDULE[turno]
    const turnoTimeDecimal = schedule.artHour + schedule.artMinute / 60

    if (art.timeDecimal >= turnoTimeDecimal) {
      result.push(turno)
    }
  }

  return result
}

/**
 * Returns turnos that have NOT yet had their official draw time.
 * Used by auto-predict to know what's still pending.
 */
export function getPendingTurnos(artNow?: ReturnType<typeof getCurrentART>): TurnoName[] {
  const available = getAvailableTurnos(artNow)
  return ALL_TURNOS.filter(t => !available.includes(t))
}

/**
 * Convert an ART time to a UTC Date for database comparisons.
 * @param dateStr - "YYYY-MM-DD" in ART
 * @param turno - turno name
 */
export function artDateTimeToUTC(dateStr: string, turno: TurnoName): Date {
  const schedule = TURNO_SCHEDULE[turno]
  if (!schedule) throw new Error(`Unknown turno: ${turno}`)

  // ART is UTC-3, so add 3 hours to get UTC
  const utcHour = schedule.artHour + 3
  const effectiveHour = utcHour >= 24 ? utcHour - 24 : utcHour
  const dayOffset = utcHour >= 24 ? 1 : 0
  const utcDate = new Date(`${dateStr}T${String(effectiveHour).padStart(2, "0")}:${String(schedule.artMinute).padStart(2, "0")}:00Z`)

  if (dayOffset > 0) {
    utcDate.setUTCDate(utcDate.getUTCDate() + dayOffset)
  }

  return utcDate
}

/**
 * Should we attempt to scrape this turno now?
 * Returns true if we're within the scraping window:
 * - After the official time (+ 2 min buffer for page update)
 * - Before the next turno's official time
 */
export function isWithinScrapeWindow(turno: TurnoName, artNow?: ReturnType<typeof getCurrentART>): boolean {
  const art = artNow || getCurrentART()
  const schedule = TURNO_SCHEDULE[turno]
  if (!schedule) return false

  const turnoTime = schedule.artHour + schedule.artMinute / 60
  const scrapeStart = turnoTime + 2 / 60 // 2 min after official time

  // Find the next turno's time
  const turnoIndex = ALL_TURNOS.indexOf(turno)
  let scrapeEnd = 24 // end of day
  if (turnoIndex < ALL_TURNOS.length - 1) {
    const nextTurno = ALL_TURNOS[turnoIndex + 1]
    const nextSchedule = TURNO_SCHEDULE[nextTurno]
    scrapeEnd = nextSchedule.artHour + nextSchedule.artMinute / 60
  }

  return art.timeDecimal >= scrapeStart && art.timeDecimal < scrapeEnd
}

/**
 * Check if a specific turno can be scraped right now
 * (after official time + buffer, before next turno, and not a holiday/Sunday).
 */
export function canScrapeTurno(turno: TurnoName, artNow?: ReturnType<typeof getCurrentART>): boolean {
  const art = artNow || getCurrentART()

  // No scrapes on Sundays
  if (art.weekday === 0) return false

  // No Previa/Primera on Saturdays
  if (art.weekday === 6 && (turno === "Previa" || turno === "Primera")) return false

  return isWithinScrapeWindow(turno, artNow)
}
