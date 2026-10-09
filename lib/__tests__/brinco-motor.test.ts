import { describe, it, expect } from "vitest"
import {
  generarPrediccionBrinco,
  calcularFactores,
  popularidadHeuristica,
  objetivoCombinacion,
  BRINCO_FACTORES_PESO,
} from "@/lib/brinco/motor"
import { validarCombinacion, BRINCO_TOTAL_BOLILLAS } from "@/lib/brinco/reglas"
import { createRng, hashSeed } from "@/lib/math/seeded-rng"

// Historia sintética determinista (no aleatoria por fuera del RNG semillado).
function historiaSintetica(n: number): number[][] {
  const rng = createRng(hashSeed("fixture", n))
  const out: number[][] = []
  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: BRINCO_TOTAL_BOLILLAS }, (_, k) => k)
    const combo: number[] = []
    while (combo.length < 6) {
      const idx = Math.floor(rng() * pool.length)
      combo.push(pool[idx])
      pool.splice(idx, 1)
    }
    out.push(combo.sort((a, b) => a - b))
  }
  return out
}

describe("brinco/motor — generación de jugada", () => {
  it("genera una jugada válida de 6 números distintos 00-39", () => {
    const pred = generarPrediccionBrinco("tradicional", historiaSintetica(30), { semilla: 123 })
    expect(validarCombinacion(pred.combinacion).ok).toBe(true)
    expect(pred.combinacion.every((n) => n >= 0 && n < BRINCO_TOTAL_BOLILLAS)).toBe(true)
  })

  it("es determinista: misma historia y semilla → misma jugada", () => {
    const h = historiaSintetica(30)
    const a = generarPrediccionBrinco("tradicional", h, { semilla: 42 })
    const b = generarPrediccionBrinco("tradicional", h, { semilla: 42 })
    expect(a.combinacion).toEqual(b.combinacion)
    expect(a.objetivo).toBe(b.objetivo)
  })

  it("semillas distintas producen jugadas (casi siempre) distintas", () => {
    const h = historiaSintetica(40)
    const a = generarPrediccionBrinco("tradicional", h, { semilla: 1 })
    const b = generarPrediccionBrinco("tradicional", h, { semilla: 999 })
    expect(a.combinacion).not.toEqual(b.combinacion)
  })

  it("las alternativas son válidas y distintas de la primaria", () => {
    const pred = generarPrediccionBrinco("tradicional", historiaSintetica(30), {
      semilla: 7,
      alternativas: 2,
    })
    expect(pred.alternativas.length).toBeGreaterThanOrEqual(1)
    const clave = (c: number[]) => [...c].sort((x, y) => x - y).join(",")
    const vistas = new Set([clave(pred.combinacion)])
    for (const alt of pred.alternativas) {
      expect(validarCombinacion(alt).ok).toBe(true)
      expect(vistas.has(clave(alt))).toBe(false)
      vistas.add(clave(alt))
    }
  })

  it("reporta los pesos y el aviso honesto (sin ventaja demostrada)", () => {
    const pred = generarPrediccionBrinco("tradicional", historiaSintetica(20), { semilla: 5 })
    expect(pred.pesos).toEqual(BRINCO_FACTORES_PESO)
    expect(pred.aviso).toMatch(/misma probabilidad/i)
    expect(pred.aviso).toMatch(/minimizando la división/i)
    expect(pred.muestreo.iteraciones).toBeGreaterThan(0)
  })
})

describe("brinco/motor — factores", () => {
  it("la popularidad heurística penaliza números redondos y espejos", () => {
    expect(popularidadHeuristica(0)).toBeGreaterThan(popularidadHeuristica(7))
    expect(popularidadHeuristica(20)).toBeGreaterThan(popularidadHeuristica(23))
    expect(popularidadHeuristica(22)).toBeGreaterThan(popularidadHeuristica(24))
  })

  it("antiSplit es mayor para números poco jugados que para redondos", () => {
    const f = calcularFactores(historiaSintetica(25))
    const redondo = f.find((x) => x.numero === 20)!
    const normal = f.find((x) => x.numero === 23)!
    expect(normal.antiSplit).toBeGreaterThan(redondo.antiSplit)
  })

  it("el atraso refleja sorteos desde la última aparición", () => {
    // Historia donde el 5 nunca aparece → atraso máximo.
    const h = historiaSintetica(20).map((c) => c.map((n) => (n === 5 ? 6 : n)))
    const f = calcularFactores(h)
    const cinco = f.find((x) => x.numero === 5)!
    expect(cinco.atraso).toBe(20)
  })
})

describe("brinco/motor — objetivo de combinación", () => {
  it("penaliza clumps (todo en una decena) y todo par/impar", () => {
    const scores = new Map<number, number>()
    for (let n = 0; n < 40; n++) scores.set(n, 0.5)
    const clump = objetivoCombinacion([20, 21, 22, 23, 24, 25], scores)
    const balanceada = objetivoCombinacion([0, 11, 17, 24, 31, 38], scores)
    expect(balanceada).toBeGreaterThan(clump)
  })

  it("el bonus de balance recompensa cubrir varias decenas y paridad mixta", () => {
    const scores = new Map<number, number>()
    for (let n = 0; n < 40; n++) scores.set(n, 0.5)
    const todaUnaDecena = objetivoCombinacion([1, 3, 5, 6, 7, 9], scores) // 1 decena, todo impar
    const multiDecena = objetivoCombinacion([1, 15, 22, 27, 33, 38], scores)
    expect(multiDecena).toBeGreaterThan(todaUnaDecena)
  })
})
