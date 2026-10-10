import { describe, it, expect } from "vitest"
import { fechaObjetivoPoceada, fechaLarga, hoyArgentina } from "@/lib/poceada/fechas"

describe("fechaObjetivoPoceada", () => {
  it("día hábil con sorteo → devuelve el mismo día", () => {
    expect(fechaObjetivoPoceada("2026-10-09")).toBe("2026-10-09") // viernes
  })

  it("sábado → hay sorteo, devuelve el mismo día", () => {
    expect(fechaObjetivoPoceada("2026-10-10")).toBe("2026-10-10") // sábado
  })

  it("domingo → salta al próximo día con sorteo (lunes 12 es feriado → martes 13)", () => {
    expect(fechaObjetivoPoceada("2026-10-11")).toBe("2026-10-13")
  })

  it("feriado → salta al día siguiente (feriados seguidos 02-03 abr → sábado 04)", () => {
    expect(fechaObjetivoPoceada("2026-04-02")).toBe("2026-04-04")
  })

  it("feriado en día de semana → no devuelve el feriado", () => {
    expect(fechaObjetivoPoceada("2026-05-01")).toBe("2026-05-02") // viernes feriado → sábado
  })
})

describe("fechaLarga", () => {
  it("formato en español con día de la semana y año", () => {
    const l = fechaLarga("2026-10-09")
    expect(l).toContain("viernes")
    expect(l).toContain("2026")
  })

  it("no depende de la timezone del servidor (siempre zona ART)", () => {
    expect(fechaLarga("2026-10-11")).toContain("domingo")
  })
})

describe("hoyArgentina", () => {
  it("devuelve una fecha YYYY-MM-DD", () => {
    expect(hoyArgentina()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
