import { describe, expect, it } from "vitest"
import {
  ALFA_LAPLACE,
  MEZCLA_EXACTA,
  ORDEN_TURNO,
  predecirCrossTurno,
  type DrawCronologico,
} from "@/lib/analisis/cross-turno"

function sorteo(fecha: string, turno: string, cabeza: number): DrawCronologico {
  return { fecha, turno, numbers: [cabeza, 11, 22, 33, 44] }
}

describe("predecirCrossTurno", () => {
  it("devuelve 100 números con scores no negativos", () => {
    const hist = [
      sorteo("2026-03-02", "Previa", 7),
      sorteo("2026-03-02", "Primera", 23),
      sorteo("2026-03-03", "Previa", 7),
      sorteo("2026-03-03", "Primera", 23),
    ]
    const scores = predecirCrossTurno(hist, "2026-03-04", "Previa")
    expect(scores.size).toBe(100)
    for (const v of scores.values()) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(Number.isFinite(v)).toBe(true)
    }
  })

  it("sobre-reacciona al número que históricamente siguió a la cabeza previa", () => {
    // Muchas veces que tras cabeza 5 en un turno siguió cabeza 42 en el otro.
    const hist: DrawCronologico[] = []
    for (let i = 1; i <= 30; i++) {
      const dia = `2026-02-${String(i + 10).padStart(2, "0")}`
      hist.push(sorteo(dia, "Previa", 5))
      hist.push(sorteo(dia, "Primera", i % 10 === 0 ? 42 : 13))
    }
    hist.push(sorteo("2026-03-15", "Previa", 5))

    const scores = predecirCrossTurno(hist, "2026-03-16", "Primera")
    const queda42 = scores.get(42)
    const quedaNada = scores.get(99)
    expect(queda42).toBeGreaterThan(quedaNada as number)
  })

  it("es determinista: misma entrada → misma salida", () => {
    const hist = [
      sorteo("2026-04-01", "Nocturna", 91),
      sorteo("2026-04-02", "Previa", 3),
      sorteo("2026-04-02", "Primera", 55),
    ]
    const a = predecirCrossTurno(hist, "2026-04-03", "Previa")
    const b = predecirCrossTurno(hist, "2026-04-03", "Previa")
    expect([...a.entries()]).toEqual([...b.entries()])
  })

  it("anti-fuga: el sorteo objetivo y los posteriores no influyen", () => {
    // Histórico con cabeza 7 → 42 repetido; el "futuro" tiene otros datos.
    const hist: DrawCronologico[] = []
    for (let i = 1; i <= 20; i++) {
      const dia = `2026-01-${String(i + 10).padStart(2, "0")}`
      hist.push(sorteo(dia, "Previa", 7))
      hist.push(sorteo(dia, "Primera", 42))
    }
    const conFuturo = [
      ...hist,
      // Solo datos posteriores al objetivo (Primera 2026-02-01 y su día+1):
      // el sorteo objetivo NO debe influir en su propia predicción.
      sorteo("2026-02-01", "Primera", 99),
      sorteo("2026-02-02", "Previa", 51),
      sorteo("2026-02-02", "Primera", 88),
    ]
    const sinFuturo = hist

    const antes = predecirCrossTurno(sinFuturo, "2026-02-01", "Primera")
    const despues = predecirCrossTurno(conFuturo, "2026-02-01", "Primera")
    expect(antes).toEqual(despues)
  })

  it("turno desconocido → mapa vacía", () => {
    const scores = predecirCrossTurno([sorteo("2026-01-01", "Previa", 5)], "2026-01-02", "Poceada")
    expect(scores.size).toBe(0)
  })

  it("histórico vacío o sin cabeza previa → mapa vacía", () => {
    expect(predecirCrossTurno([], "2026-01-01", "Previa").size).toBe(0)
  })

  it("constantes de modelo son simétricas y en rangos válidos", () => {
    expect(MEZCLA_EXACTA).toBeGreaterThanOrEqual(0)
    expect(MEZCLA_EXACTA).toBeLessThanOrEqual(1)
    expect(ALFA_LAPLACE).toBeGreaterThan(0)
    expect(ORDEN_TURNO.Previa).toBeLessThan(ORDEN_TURNO.Nocturna)
  })
})
