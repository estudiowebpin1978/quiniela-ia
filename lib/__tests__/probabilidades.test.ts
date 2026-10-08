import { describe, it, expect } from "vitest"
import {
  QUINIELA,
  POCEADA,
  pNinguno,
  pCoincidenciaMod,
  pCabezaMod,
  pAlMenosT,
  pPoceada,
  hipergeom,
  logChoose,
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

describe("hipergeométrica / logChoose", () => {
  it("logChoose(10,3)=120", () => {
    expect(Math.exp(logChoose(10, 3))).toBeCloseTo(120, 6)
  })
  it("las PMF de Poceada suman 1", () => {
    let s = 0
    for (let k = 0; k <= 8; k++) s += hipergeom(8, 100, 20, k)
    expect(s).toBeCloseTo(1, 8)
  })
})

describe("pPoceada — baseline azar ≥5 (exacto vs aproximación)", () => {
  it("K=8, ≥5 aciertos = hipergeométrica exacta ≈ 0.00754 (sin reemplazo)", () => {
    // El sorteo es SIN reemplazo (20 distintos de 100) → hipergeométrica.
    // oos-eval/calibration usan 0.0104 que es una BINOMIAL(n=8,p=0.2) con
    // reemplazo (aprox.). La exacta es menor porque los sorteos sin
    // reemplazo tienen varianza menor. Ambas documentadas; aquí la exacta.
    const p = pPoceada(POCEADA, 8, 5)
    expect(p).toBeGreaterThan(0.0074)
    expect(p).toBeLessThan(0.0077)
  })
  it("coincide con binomTail(5,8,0.2)=0.0104 si se aproxima con reemplazo", () => {
    // Verificación cruzada de la aproximación binomial que usa oos-eval.
    let binom = 0
    const c = (n: number, k: number): number => {
      let r = 1
      for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1)
      return r
    }
    for (let k = 5; k <= 8; k++) binom += c(8, k) * 0.2 ** k * 0.8 ** (8 - k)
    expect(binom).toBeGreaterThan(0.0103)
    expect(binom).toBeLessThan(0.0105)
  })
  it("K más grande aumenta la probabilidad", () => {
    expect(pPoceada(POCEADA, 12, 5)).toBeGreaterThan(pPoceada(POCEADA, 8, 5))
  })
  it("umbral alto → probabilidad baja", () => {
    expect(pPoceada(POCEADA, 8, 8)).toBeLessThan(pPoceada(POCEADA, 8, 5))
  })
})

describe("pAlMenosT", () => {
  it("t=0 → 1", () => {
    expect(pAlMenosT(8, 100, 20, 0)).toBeCloseTo(1, 8)
  })
  it("t > K → 0", () => {
    expect(pAlMenosT(8, 100, 20, 9)).toBe(0)
  })
})
