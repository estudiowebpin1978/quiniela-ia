import { describe, it, expect } from "vitest"
import { TURNO_SCHEDULE, ALL_TURNOS } from "@/lib/quiniela-time"
import { esFeriado, esDiaSinSorteo, todosLosFeriados } from "@/lib/feriados"

describe("TURNO_SCHEDULE", () => {
  it("has all 5 turnos", () => {
    expect(ALL_TURNOS).toHaveLength(5)
    expect(ALL_TURNOS).toEqual(["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"])
  })

  it("each turno has valid hour and minute", () => {
    for (const turno of ALL_TURNOS) {
      const sched = TURNO_SCHEDULE[turno]
      expect(sched).toBeDefined()
      expect(sched.artHour).toBeGreaterThanOrEqual(0)
      expect(sched.artHour).toBeLessThan(24)
      expect(sched.artMinute).toBeGreaterThanOrEqual(0)
      expect(sched.artMinute).toBeLessThan(60)
    }
  })

  it("turnos are in chronological order", () => {
    const hours = ALL_TURNOS.map(t => TURNO_SCHEDULE[t].artHour + TURNO_SCHEDULE[t].artMinute / 60)
    for (let i = 1; i < hours.length; i++) {
      expect(hours[i]).toBeGreaterThan(hours[i - 1])
    }
  })
})

describe("esFeriado", () => {
  it("recognizes 2026-01-01 as holiday", () => {
    expect(esFeriado("2026-01-01")).toBe(true)
  })

  it("recognizes 2026-07-09 as holiday (Día de la Independencia)", () => {
    expect(esFeriado("2026-07-09")).toBe(true)
  })

  it("returns false for a non-holiday", () => {
    expect(esFeriado("2026-07-10")).toBe(false)
  })

  it("returns false for unknown year", () => {
    expect(esFeriado("2099-01-01")).toBe(false)
  })
})

describe("esDiaSinSorteo", () => {
  it("Sunday is always no-draw", () => {
    expect(esDiaSinSorteo("2026-09-06", 0)).toBe(true) // Sunday
  })

  it("holiday on weekday is no-draw", () => {
    expect(esDiaSinSorteo("2026-07-09", 4)).toBe(true) // Thursday holiday
  })

  it("normal weekday is a draw day", () => {
    expect(esDiaSinSorteo("2026-09-08", 1)).toBe(false) // Monday
  })

  it("Saturday is a draw day (not holiday)", () => {
    expect(esDiaSinSorteo("2026-09-05", 6)).toBe(false) // Saturday
  })
})

describe("todosLosFeriados", () => {
  it("returns at least 10 holidays per year", () => {
    const feriados = todosLosFeriados()
    expect(feriados.length).toBeGreaterThan(20) // 2 years * ~15 holidays
  })
})
