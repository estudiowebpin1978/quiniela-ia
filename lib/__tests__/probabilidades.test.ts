import { describe, it, expect } from "vitest"
import {
  QUINIELA,
  pNinguno,
  pCoincidenciaMod,
  pCabezaMod,
} from "@/lib/estrategia/probabilidades"

describe("pNinguno (hipergeométrica de producto)", () => {
  it("cota trivial: 0 ganadores → 1", () => {
    expect(pNinguno(10000, 0, 20)).toBe(1)
  })
  it("si D > N-g, obligatorio al menos uno → 0", () => {
    expect(pNinguno(10000, 9990, 20)).toBe(0)
  })
  it("coincide con la razón combinacional directa para valores chicos", () => {
    // N=10, g=3, D=4 → C(7,4)/C(10,4) = 35/210 = 1/6
    const comb = (n: number, k: number): number => {
      let r = 1
      for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
      return r
    }
    const esperado = comb(7, 4) / comb(10, 4)
    expect(pNinguno(10, 3, 4)).toBeCloseTo(esperado, 10)
  })
})

describe("pCoincidenciaMod — Quiniela 2C (baseline azar)", () => {
  it("K=10 picks ≈ 0.878 — calibra contra OOS ~0.87/0.905", () => {
    const p = pCoincidenciaMod(QUINIELA, 10, 100)
    // Azar exacto con 10 clases × 100 números de 10000, 20 sorteados.
    expect(p).toBeGreaterThan(0.87)
    expect(p).toBeLessThan(0.92)
  })
  it("crece con K y K=100 (todas las clases) → 1", () => {
    expect(pCoincidenciaMod(QUINIELA, 1, 100)).toBeLessThan(
      pCoincidenciaMod(QUINIELA, 10, 100),
    )
    expect(pCoincidenciaMod(QUINIELA, 100, 100)).toBeCloseTo(1, 10)
  })
  it("K=1 (una sola clase = 100 números) ≈ 1 - C(9900,20)/C(10000,20)", () => {
    const p = pCoincidenciaMod(QUINIELA, 1, 100)
    expect(p).toBeGreaterThan(0.17)
    expect(p).toBeLessThan(0.20)
  })
})

describe("pCabezaMod — criterio estricto 'cabeza en picks'", () => {
  it("Quiniela 2C K=10 → 0.10 exacto", () => {
    expect(pCabezaMod(QUINIELA, 10, 100)).toBeCloseTo(0.10, 10)
  })
  it("K=1 → 0.01", () => {
    expect(pCabezaMod(QUINIELA, 1, 100)).toBeCloseTo(0.01, 10)
  })
  it("límites", () => {
    expect(pCabezaMod(QUINIELA, 0, 100)).toBe(0)
    expect(pCabezaMod(QUINIELA, 100, 100)).toBe(1)
    expect(() => pCabezaMod(QUINIELA, 101, 100)).toThrow()
  })
})


