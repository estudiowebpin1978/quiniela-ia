/**
 * SEASONAL FEATURES - Features temporales avanzadas
 * 
 * Patrones estacionales, feriados, quincena, correlaciones temporales.
 */

export interface SeasonalScore {
  number: number
  seasonScore: number    // 0-1
  factors: string[]
}

/**
 * Calcula scores estacionales para cada número (0-99).
 * Analiza patrones por: día del mes, quincena, feriados, mes, estación.
 */
export function calculateSeasonalScores(
  sequences: number[][],
  dates: string[],
  targetMonth?: number
): Record<number, number> {
  const scores: Record<number, number> = {}
  const currentMonth = targetMonth ?? new Date().getMonth() + 1
  const currentDay = new Date().getDate()

  for (let n = 0; n < 100; n++) {
    let score = 0.5 // baseline

    // 1. Patrón de quincena (1-15 vs 16-31)
    const firstHalf = countInPeriod(sequences, dates, n, 1, 15)
    const secondHalf = countInPeriod(sequences, dates, n, 16, 31)
    const isSecondHalf = currentDay > 15
    if (isSecondHalf && secondHalf > firstHalf) score += 0.1
    else if (!isSecondHalf && firstHalf > secondHalf) score += 0.1
    else score -= 0.05

    // 2. Patrón de mes
    const monthScore = getMonthAffinity(sequences, dates, n, currentMonth)
    score += monthScore * 0.15

    // 3. Números "del mes" (1-12 en el mes actual, etc.)
    const dayAffinity = getDayAffinity(sequences, n, currentDay)
    score += dayAffinity * 0.1

    // 4. Patrón de fin de semana vs semana
    const weekendScore = getWeekendPattern(sequences, dates, n)
    const dayOfWeek = new Date().getDay()
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
    if (isWeekend && weekendScore > 0.5) score += 0.08
    else if (!isWeekend && weekendScore < 0.5) score += 0.08
    else score -= 0.03

    // 5. Números estacionales (verano: 1-3, otoño: 4-6, etc.)
    const season = getSeason(currentMonth)
    const seasonAffinity = getSeasonAffinity(sequences, n, season, dates)
    score += seasonAffinity * 0.07

    scores[n] = Math.max(0, Math.min(1, score))
  }

  return scores
}

/**
 * Números que más salieron en un período del mes.
 */
function countInPeriod(sequences: number[][], dates: string[], target: number, startDay: number, endDay: number): number {
  let count = 0
  for (let i = 0; i < sequences.length; i++) {
    const dateStr = dates[i] || ""
    const day = parseInt(dateStr.split("-")[2] || "0")
    if (day >= startDay && day <= endDay) {
      if (sequences[i].map(n => n % 100).includes(target)) count++
    }
  }
  return count
}

/**
 * Afinidad de un número con un mes específico.
 */
function getMonthAffinity(sequences: number[][], dates: string[], target: number, month: number): number {
  let monthCount = 0
  let otherCount = 0
  let monthTotal = 0
  let otherTotal = 0

  for (let i = 0; i < sequences.length; i++) {
    const dateStr = dates[i] || ""
    const m = parseInt(dateStr.split("-")[1] || "0")
    const has = sequences[i].map(n => n % 100).includes(target)
    if (m === month) {
      monthTotal++
      if (has) monthCount++
    } else {
      otherTotal++
      if (has) otherCount++
    }
  }

  const monthRate = monthTotal > 0 ? monthCount / monthTotal : 0
  const otherRate = otherTotal > 0 ? otherCount / otherTotal : 0
  const maxRate = Math.max(monthRate, otherRate, 0.01)
  return (monthRate - otherRate + 1) / 2 // normalize to 0-1
}

/**
 * Afinidad de un número con un día del mes.
 */
function getDayAffinity(sequences: number[][], target: number, day: number): number {
  // Los números que aparecen más cerca del día actual
  const window = 3
  let nearCount = 0
  let farCount = 0

  for (let i = 0; i < sequences.length; i++) {
    // Usar la posición como proxy del día
    const dayOfMonth = (i % 30) + 1
    const has = sequences[i].map(n => n % 100).includes(target)
    if (Math.abs(dayOfMonth - day) <= window) {
      if (has) nearCount++
    } else {
      if (has) farCount++
    }
  }

  return nearCount > farCount ? 0.7 : nearCount < farCount ? 0.3 : 0.5
}

/**
 * Patrón de fin de semana para un número.
 */
function getWeekendPattern(sequences: number[][], dates: string[], target: number): number {
  let weekendCount = 0
  let weekdayCount = 0
  let weekendTotal = 0
  let weekdayTotal = 0

  for (let i = 0; i < sequences.length; i++) {
    const dateStr = dates[i] || ""
    const d = new Date(dateStr + "T12:00:00-03:00")
    const isWeekend = d.getDay() === 0 || d.getDay() === 6
    const has = sequences[i].map(n => n % 100).includes(target)

    if (isWeekend) {
      weekendTotal++
      if (has) weekendCount++
    } else {
      weekdayTotal++
      if (has) weekdayCount++
    }
  }

  const weekendRate = weekendTotal > 0 ? weekendCount / weekendTotal : 0
  const weekdayRate = weekdayTotal > 0 ? weekdayCount / weekdayTotal : 0
  return weekendRate > weekdayRate ? 0.7 : 0.3
}

/**
 * Temporada del año: verano(12-2), otoño(3-5), invierno(6-8), primavera(9-11)
 */
function getSeason(month: number): string {
  if (month >= 12 || month <= 2) return "verano"
  if (month >= 3 && month <= 5) return "otoño"
  if (month >= 6 && month <= 8) return "invierno"
  return "primavera"
}

/**
 * Afinidad de un número con una temporada.
 */
function getSeasonAffinity(sequences: number[][], target: number, season: string, dates: string[]): number {
  const seasonMonths: Record<string, number[]> = {
    verano: [12, 1, 2],
    otoño: [3, 4, 5],
    invierno: [6, 7, 8],
    primavera: [9, 10, 11]
  }

  const months = seasonMonths[season] || []
  let seasonCount = 0
  let seasonTotal = 0
  let otherCount = 0
  let otherTotal = 0

  for (let i = 0; i < sequences.length; i++) {
    const dateStr = dates[i] || ""
    const m = parseInt(dateStr.split("-")[1] || "0")
    const has = sequences[i].map(n => n % 100).includes(target)

    if (months.includes(m)) {
      seasonTotal++
      if (has) seasonCount++
    } else {
      otherTotal++
      if (has) otherCount++
    }
  }

  const seasonRate = seasonTotal > 0 ? seasonCount / seasonTotal : 0
  const otherRate = otherTotal > 0 ? otherCount / otherTotal : 0
  return seasonRate > otherRate ? 0.7 : 0.3
}

/**
 * Detecta feriados argentinos que afectan la quiniela.
 */
export function isHoliday(dateStr: string): boolean {
  const feriados = [
    "01-01", "02-16", "02-17", "03-24", "04-02", "04-03",
    "05-01", "05-25", "06-20", "07-09", "08-17",
    "10-12", "11-23", "11-27", "12-08", "12-25"
  ]
  const mmdd = dateStr.slice(5)
  return feriados.includes(mmdd)
}

/**
 * Obtiene el número del día (1-31) del sorteo.
 */
export function getDayOfMonth(dateStr: string): number {
  return parseInt(dateStr.split("-")[2] || "0")
}

/**
 * Obtiene el número de semana del mes (1-4).
 */
export function getWeekOfMonth(dateStr: string): number {
  const d = new Date(dateStr + "T12:00:00-03:00")
  return Math.ceil(d.getDate() / 7)
}
