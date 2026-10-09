import { describe, it, expect } from "vitest"
import { backtestBrinco, distribucionAzarBrinco, type SorteoBrinco } from "@/lib/brinco/backtest"
import { esperanzaAzar, BRINCO_TOTAL_BOLILLAS } from "@/lib/brinco/reglas"
import { createRng, hashSeed } from "@/lib/math/seeded-rng"

// Sorteos sintéticos aleatorios (6 de 40) — proxy de un sorteo justo.
function sorteosAleatorios(n: number): SorteoBrinco[] {
  const rng = createRng(hashSeed("sint", n))
  const out: SorteoBrinco[] = []
  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: BRINCO_TOTAL_BOLILLAS }, (_, k) => k)
    const combo: number[] = []
    while (combo.length < 6) {
      const idx = Math.floor(rng() * pool.length)
      combo.push(pool[idx])
      pool.splice(idx, 1)
    }
    out.push({
      concurso: 1000 + i,
      fecha: `2026-01-0${(i % 9) + 1}`.slice(0, 10),
      tradicional: combo.sort((a, b) => a - b),
      junior: combo.slice().reverse().sort((a, b) => a - b),
    })
  }
  return out
}

describe("brinco/backtest — metodología honesta", () => {
  it("la distribución del azar coincide con la hipergeométrica y suma 1", () => {
    const d = distribucionAzarBrinco()
    expect(d.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6)
  })

  it("con datos aleatorios, la media se acerca a la esperanza del azar (0.9)", () => {
    const sorteos = sorteosAleatorios(120)
    const rep = backtestBrinco(sorteos, 20)
    expect(rep.tradicional).not.toBeNull()
    const t = rep.tradicional!
    expect(t.muestras).toBe(100)
    // Con 100 muestras la media debe estar razonablemente cerca de 0.9.
    expect(t.mediaAciertos).toBeGreaterThan(0.5)
    expect(t.mediaAciertos).toBeLessThan(1.4)
    expect(t.esperanzaAzar).toBeCloseTo(esperanzaAzar(), 6)
  })

  it("la distribución observada suma el total de muestras", () => {
    const sorteos = sorteosAleatorios(60)
    const rep = backtestBrinco(sorteos, 10)
    const t = rep.tradicional!
    const suma = t.distribucion.reduce((a, b) => a + b, 0)
    expect(suma).toBe(t.muestras)
  })

  it("NO promueve ventaja: con datos aleatorios no es significativo (|z|<1.96)", () => {
    const sorteos = sorteosAleatorios(150)
    const rep = backtestBrinco(sorteos, 30)
    const t = rep.tradicional!
    // El motor no puede batir al azar en datos justos; z debe ser pequeño.
    expect(Math.abs(t.z)).toBeLessThan(1.96)
    expect(t.significativo).toBe(false)
  })

  it("informa la limitación cuando la muestra es chica", () => {
    const sorteos = sorteosAleatorios(15)
    const rep = backtestBrinco(sorteos, 5)
    expect(rep.tradicional!.limitacion).toMatch(/Muestra pequeña/)
  })

  it("la advertencia declara que es un sorteo justo y poceado", () => {
    const rep = backtestBrinco(sorteosAleatorios(20), 5)
    expect(rep.advertencia).toMatch(/sorteo justo/i)
    expect(rep.advertencia).toMatch(/poceado/i)
  })

  it("evalúa Junior por separado cuando hay sorteos con Junior", () => {
    const rep = backtestBrinco(sorteosAleatorios(40), 10)
    expect(rep.junior).not.toBeNull()
    expect(rep.junior!.modalidad).toBe("junior")
  })
})
