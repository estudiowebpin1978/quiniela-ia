import { describe, it, expect } from "vitest"
import { QUINIELA, POCEADA } from "@/lib/estrategia/probabilidades"
import {
  calcularEV,
  probabilidadModalidad,
  compararEV,
  type PremioModalidad,
} from "@/lib/estrategia/ev"

describe("probabilidadModalidad (delega a probabilidades.ts)", () => {
  it("coincidencia 2C Quiniela K=10 ≈ azar", () => {
    const p = probabilidadModalidad(QUINIELA, "coincidencia", 10)
    expect(p).toBeGreaterThan(0.87)
  })
  it("cabeza Quiniela K=10 = 0.10", () => {
    expect(probabilidadModalidad(QUINIELA, "cabeza", 10)).toBeCloseTo(0.1, 10)
  })
  it("poceada K=8 ≥5 = hipergeométrica exacta", () => {
    expect(probabilidadModalidad(POCEADA, "poceada", 8)).toBeCloseTo(0.00754, 4)
  })
})

describe("calcularEV — fail-closed sin premios oficiales", () => {
  it("premio null → ev null, calculable false (NO inventa)", () => {
    const r = calcularEV({
      modalidad: "2 cifras",
      kPicks: 10,
      pGanar: 0.87,
      premio: null,
      costo: 100,
    })
    expect(r.calculable).toBe(false)
    expect(r.ev).toBeNull()
    expect(r.motivoNoCalculable).toBeTruthy()
  })
  it("costo null → ev null", () => {
    const r = calcularEV({
      modalidad: "x",
      kPicks: 1,
      pGanar: 0.5,
      premio: 500,
      costo: null,
    })
    expect(r.calculable).toBe(false)
    expect(r.ev).toBeNull()
  })
  it("EV = p·premio − costo cuando hay datos", () => {
    const r = calcularEV({
      modalidad: "4 cifras",
      kPicks: 1,
      pGanar: 0.001,
      premio: 100000, // 0.001 × 100000 = 100
      costo: 100,
    })
    expect(r.calculable).toBe(true)
    expect(r.ev).toBeCloseTo(0, 6) // 100 − 100 = 0 (justo)
    expect(r.evPct).toBeCloseTo(0, 6)
  })
  it("EV negativo = pérdida esperada (caso típico lotería)", () => {
    const r = calcularEV({
      modalidad: "2 cifras",
      kPicks: 10,
      pGanar: 0.1,
      premio: 500, // 0.1×500 = 50
      costo: 100, // 50 − 100 = −50
    })
    expect(r.ev).toBeCloseTo(-50, 6)
    expect(r.evPct).toBeCloseTo(-0.5, 6)
  })
  it("suma otrosPremios (varias categorías)", () => {
    const r = calcularEV({
      modalidad: "poceada",
      kPicks: 8,
      pGanar: 0.0075,
      premio: 10000,
      costo: 100,
      otrosPremios: [{ categoria: "4 aciertos", prob: 0.1, premio: 200 }],
    })
    // 0.0075×10000 + 0.1×200 − 100 = 75 + 20 − 100 = −5
    expect(r.ev).toBeCloseTo(-5, 6)
  })
})

describe("compararEV", () => {
  const conPremios: PremioModalidad[] = [
    { modalidad: "A", kPicks: 1, pGanar: 0.5, premio: 100, costo: 100 }, // EV −50
    { modalidad: "B", kPicks: 1, pGanar: 0.9, premio: 200, costo: 100 }, // EV +80
  ]
  it("ordena por EV desc y detecta mejor", () => {
    const r = compararEV(conPremios)
    expect(r.mejor?.modalidad).toBe("B")
    expect(r.calculables[0].ev).toBeGreaterThan(r.calculables[1].ev ?? 0)
    expect(r.todasNegativas).toBe(false)
  })
  it("sin premios → pendientes, mejor null", () => {
    const r = compararEV([
      { modalidad: "X", kPicks: 1, pGanar: 0.5, premio: null, costo: 100 },
    ])
    expect(r.calculables).toHaveLength(0)
    expect(r.pendientesDePremios).toHaveLength(1)
    expect(r.mejor).toBeNull()
  })
  it("todasNegativas cuando todo tiene EV < 0", () => {
    const r = compararEV([
      { modalidad: "A", kPicks: 1, pGanar: 0.1, premio: 50, costo: 100 },
      { modalidad: "B", kPicks: 1, pGanar: 0.2, premio: 100, costo: 1000 },
    ])
    expect(r.todasNegativas).toBe(true)
  })
})
