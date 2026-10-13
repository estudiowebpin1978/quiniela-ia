import { describe, it, expect } from "vitest"
import {
  tablaEVQuiniela,
  resumenEVQuiniela,
  estructuraPoceada,
  POCEADA_DISTRIBUCION_POZO,
  POCEADA_APUESTA_SIMPLE,
  APUESTA_MINIMA_LOTBA,
  FUENTE_PREMIOS,
} from "@/lib/estrategia/premios-lotba"
import { LOTBA } from "@/lib/config/lotba"

describe("tablaEVQuiniela — EV oficial Quiniela de la Ciudad (directa a la cabeza)", () => {
  const tabla = tablaEVQuiniela()
  const por = (cod: string) => tabla.find((r) => r.codigo === cod)!

  it("cita las fuentes primarias de la Ciudad (no la jurisdicción Provincia)", () => {
    // Dominio oficial tomado del config (evita hardcodear el hostname):
    expect(FUENTE_PREMIOS).toContain(new URL(LOTBA.quinielaUrl).hostname)
    expect(FUENTE_PREMIOS).toContain("32/2018")
    expect(FUENTE_PREMIOS).toContain("2026-10-13")
    // La fuente vieja (Resolución PBA / loteria.gba.gob.ar) ya no debe aparecer:
    expect(FUENTE_PREMIOS).not.toContain("1992")
    expect(FUENTE_PREMIOS).not.toContain("gba.gob.ar")
    expect(tabla.every((r) => r.fuente === FUENTE_PREMIOS)).toBe(true)
  })

  it("1 cifra: EV −30% (0.1 × 1050 − 150)", () => {
    const r = por("c1")
    expect(r.calculable).toBe(true)
    expect(r.multiplicador).toBe(7)
    expect(r.ev).toBeCloseTo(-45, 6)
    expect(r.evPct).toBeCloseTo(-0.3, 6)
  })

  it("2 cifras: EV −30% (0.01 × 10500 − 150)", () => {
    const r = por("c2")
    expect(r.multiplicador).toBe(70)
    expect(r.ev).toBeCloseTo(-45, 6)
    expect(r.evPct).toBeCloseTo(-0.3, 6)
  })

  it("3 cifras: EV −40% (0.001 × 90000 − 150)", () => {
    const r = por("c3")
    expect(r.multiplicador).toBe(600)
    expect(r.ev).toBeCloseTo(-60, 6)
    expect(r.evPct).toBeCloseTo(-0.4, 6)
  })

  it("4 cifras: EV −65% (0.0001 × 525000 − 150) — peor que 3 cifras", () => {
    const r = por("c4")
    expect(r.multiplicador).toBe(3500)
    expect(r.ev).toBeCloseTo(-97.5, 6)
    expect(r.evPct).toBeCloseTo(-0.65, 6)
    expect(r.ev!).toBeLessThan(por("c3").ev!)
  })

  it("5 cifras: NO existe en el juego de la Ciudad (1-4 cifras) → ev null, sin premio ni prob inventados", () => {
    const r = por("c5")
    expect(r.aplicable).toBe(false)
    expect(r.calculable).toBe(false)
    expect(r.ev).toBeNull()
    expect(r.multiplicador).toBeNull()
    expect(r.motivoNoCalculable).toContain("0000-9999")
  })

  it("Redoblona Exacta: pago oficial 3500×, prob marcada aproximada, EV −65%", () => {
    const r = por("red-exacta")
    expect(r.multiplicador).toBe(3500)
    expect(r.aproximado).toBe(true)
    expect(r.calculable).toBe(true)
    // return-rate = (1/100)² × 3500 = 0.35 → EV = 0.35 × 150 − 150 = −97.5
    expect(r.ev).toBeCloseTo(-97.5, 6)
    expect(r.evPct).toBeCloseTo(-0.65, 6)
    expect(r.ev!).toBeLessThan(0)
  })

  it("Redoblona por Extensión: pago oficial 70×, EV no calculable (P depende de los rangos elegidos)", () => {
    const r = por("red-extension")
    expect(r.multiplicador).toBe(70)
    expect(r.calculable).toBe(false)
    expect(r.ev).toBeNull()
    expect(r.motivoNoCalculable).toContain("rangos")
  })
})

describe("resumenEVQuiniela", () => {
  const res = resumenEVQuiniela()

  it("todas las aplicables calculables tienen EV negativo", () => {
    const aplicables = res.tabla.filter((r) => r.calculable && r.ev != null)
    expect(aplicables.length).toBeGreaterThanOrEqual(4)
    expect(aplicables.every((r) => (r.ev ?? 0) < 0)).toBe(true)
  })

  it("peor EV = 4 cifras o Redoblona Exacta (return-rate mín.), mejor = 1 o 2 cifras", () => {
    expect(res.peorEV).toMatch(/4 cifras|Redoblona Exacta/)
    expect(res.mejorEV).toMatch(/1 cifra|2 cifras/)
  })

  it("apuesta mínima oficial = 150 (programación LOTBA oct-2026)", () => {
    expect(APUESTA_MINIMA_LOTBA).toBe(150)
  })

  it("EV escala lineal con la apuesta", () => {
    const r200 = tablaEVQuiniela(200).find((r) => r.codigo === "c2")!
    const r100 = tablaEVQuiniela(100).find((r) => r.codigo === "c2")!
    expect(r200.ev!).toBeCloseTo(2 * r100.ev!, 6)
  })
})

describe("estructuraPoceada — datos OFICIALES (programación LOTBA oct-2026)", () => {
  const poceada = estructuraPoceada()

  it("apuesta simple 8 números 00-99 = $1700 (valor oficial)", () => {
    expect(poceada.apuestaSimple).toBe(1700)
    expect(POCEADA_APUESTA_SIMPLE).toBe(1700)
    expect(poceada.numerosElegidos).toBe(8)
    expect(poceada.universo).toContain("00-99")
  })

  it("resuelve por el último sorteo Quiniela del día (Nocturna 21:00), 20 distintos", () => {
    expect(poceada.resolucion).toContain("21:00")
    expect(poceada.resolucion).toContain("20 números distintos")
  })

  it("pozo = 45% de la recaudación y la distribución oficial suma 100%", () => {
    expect(poceada.pozoPorcentajeRecaudacion).toBe(45)
    const suma = POCEADA_DISTRIBUCION_POZO.reduce((a, d) => a + d.porcentaje, 0)
    expect(suma).toBeCloseTo(100, 6)
    // Desglose oficial: 60 / 12 / 7 / 5.5 / agente 0.5 / reserva 15
    expect(POCEADA_DISTRIBUCION_POZO.map((d) => d.porcentaje)).toEqual([60, 12, 7, 5.5, 0.5, 15])
  })

  it("categorías oficiales 8/7/6/5 aciertos con sus % del pozo", () => {
    expect(poceada.categorias.map((c) => c.aciertos)).toEqual([8, 7, 6, 5])
    expect(poceada.categorias.map((c) => c.porcentajePozo)).toEqual([60, 12, 7, 5.5])
    // 5 aciertos = reintegro del valor de la apuesta (EV neto 0)
    expect(poceada.categorias[3].premio).toContain("reintegro")
  })

  it("probabilidades de azar EXACTAS (hipergeométrica N=100, D=20, K=8)", () => {
    const [c8, c7, c6, c5] = poceada.categorias
    expect(c5.pAzar).toBeCloseTo(0.0068451989, 8)
    expect(c6.pAzar).toBeCloseTo(0.0006581922, 8)
    expect(c7.pAzar).toBeCloseTo(0.0000333262, 8)
    expect(c8.pAzar).toBeCloseTo(0.000000676938, 10)
    expect(poceada.pAlMenos5).toBeCloseTo(0.0075373942, 8)
    // Monótona decreciente y suma de colas consistente
    expect(c8.pAzar).toBeLessThan(c7.pAzar)
    expect(c7.pAzar).toBeLessThan(c6.pAzar)
    expect(c6.pAzar).toBeLessThan(c5.pAzar)
    expect(c5.pAzar + c6.pAzar + c7.pAzar + c8.pAzar).toBeCloseTo(poceada.pAlMenos5, 10)
  })

  it("EV = null con motivo honesto (parimutuel) — nunca un monto inventado", () => {
    expect(poceada.ev).toBeNull()
    expect(poceada.motivoNoCalculable).toContain("PARIMUTUEL")
    expect(poceada.motivoNoCalculable).toContain("No se inventa")
    expect(poceada.fuente).toBe(FUENTE_PREMIOS)
  })
})
