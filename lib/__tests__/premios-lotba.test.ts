import { describe, it, expect } from "vitest"
import {
  tablaEVQuiniela,
  resumenEVQuiniela,
  APUESTA_MINIMA_LOTBA,
  FUENTE_PREMIOS,
} from "@/lib/estrategia/premios-lotba"

describe("tablaEVQuiniela — EV oficial Quiniela (directa a la cabeza)", () => {
  const tabla = tablaEVQuiniela()
  const por = (cod: string) => tabla.find((r) => r.codigo === cod)!

  it("cita la fuente primaria", () => {
    expect(FUENTE_PREMIOS).toContain("1992")
    expect(tabla.every((r) => r.fuente === FUENTE_PREMIOS)).toBe(true)
  })

  it("1 cifra: EV −30% (0.1 × 700 − 100)", () => {
    const r = por("c1")
    expect(r.calculable).toBe(true)
    expect(r.multiplicador).toBe(7)
    expect(r.ev).toBeCloseTo(-30, 6)
    expect(r.evPct).toBeCloseTo(-0.3, 6)
  })

  it("2 cifras: EV −30% (0.01 × 7000 − 100)", () => {
    const r = por("c2")
    expect(r.multiplicador).toBe(70)
    expect(r.ev).toBeCloseTo(-30, 6)
  })

  it("3 cifras: EV −40% (0.001 × 60000 − 100)", () => {
    const r = por("c3")
    expect(r.multiplicador).toBe(600)
    expect(r.ev).toBeCloseTo(-40, 6)
  })

  it("4 cifras: EV −65% (0.0001 × 350000 − 100) — peor que 3 cifras", () => {
    const r = por("c4")
    expect(r.multiplicador).toBe(3500)
    expect(r.ev).toBeCloseTo(-65, 6)
    expect(r.ev!).toBeLessThan(por("c3").ev!)
  })

  it("5 cifras: NO aplica (extracto 4 dígitos) → ev null, sin prob inventada", () => {
    const r = por("c5")
    expect(r.aplicable).toBe(false)
    expect(r.calculable).toBe(false)
    expect(r.ev).toBeNull()
    expect(r.motivoNoCalculable).toContain("0000-9999")
  })

  it("redoblona: pago 80× confirmado, prob marcada aproximada", () => {
    const r = por("red5")
    expect(r.multiplicador).toBe(80)
    expect(r.aproximado).toBe(true)
    expect(r.calculable).toBe(true)
    // return-rate = P × 80 muy bajo → EV fuertemente negativo
    expect(r.ev!).toBeLessThan(-90)
  })
})

describe("resumenEVQuiniela", () => {
  const res = resumenEVQuiniela()

  it("todas las aplicables tienen EV negativo", () => {
    const aplicables = res.tabla.filter((r) => r.calculable && r.ev != null)
    expect(aplicables.length).toBeGreaterThanOrEqual(4)
    expect(aplicables.every((r) => (r.ev ?? 0) < 0)).toBe(true)
  })

  it("peor EV = redoblona (return-rate mín.), mejor = 1 o 2 cifras", () => {
    expect(res.peorEV).toContain("Redoblona")
    expect(res.mejorEV).toMatch(/1 cifra|2 cifras/)
  })

  it("apuesta mínima oficial = 100", () => {
    expect(APUESTA_MINIMA_LOTBA).toBe(100)
  })

  it("EV escala lineal con la apuesta", () => {
    const r200 = tablaEVQuiniela(200).find((r) => r.codigo === "c2")!
    const r100 = tablaEVQuiniela(100).find((r) => r.codigo === "c2")!
    expect(r200.ev!).toBeCloseTo(2 * r100.ev!, 6)
  })
})
