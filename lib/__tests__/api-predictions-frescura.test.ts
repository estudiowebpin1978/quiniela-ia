import { describe, it, expect } from "vitest"
import { cacheFrescoParaDestino } from "@/lib/api/predictions"

// Guard de frescura del cache-first (GET y POST /api/predictions).
// Una fila fechada D se calculó con histórico estrictamente < D; para servirla
// como predicción de un destino T > D hacen falta los sorteos de [D, T).
// Regresión del bug 2026-10-14: el cache sirvió filas de 4 días de atraso
// porque sólo chequeaba date <= targetDate.
describe("cacheFrescoParaDestino", () => {
  it("misma fecha → fresco, aunque el sorteo del día ya se haya jugado", () => {
    // Por diseño la fila del día D excluye los resultados del día D
    expect(cacheFrescoParaDestino("2026-10-14", "2026-10-14", ["2026-10-14"])).toBe(true)
    expect(cacheFrescoParaDestino("2026-10-14", "2026-10-14", [])).toBe(true)
  })

  it("regresión bug prod: fila del 10-10 servida al 10-14 con sorteo del 10-13 → VIEJA", () => {
    // Escenario real: la cadena de cron-run quedó bloqueada y el lte(date)
    // devolvía la última fila existente (10-10) para el destino 10-14.
    const sorteosDelTurno = ["2026-10-10", "2026-10-13"]
    expect(cacheFrescoParaDestino("2026-10-10", "2026-10-14", sorteosDelTurno)).toBe(false)
  })

  it("fila del día anterior con su sorteo ya jugado → VIEJA para el día siguiente", () => {
    // La fila 10-13 no vio el sorteo del 10-13; el modelo fresco del 10-14 sí
    expect(cacheFrescoParaDestino("2026-10-13", "2026-10-14", ["2026-10-13"])).toBe(false)
  })

  it("cache viejo sin sorteos en [cache, destino) → fresco (datos al día)", () => {
    // 10-11 (domingo) y 10-12 (feriado) no sortean: si el turno no jugó en el
    // rango, la fila vieja entrenó exactamente igual que una fresca
    expect(cacheFrescoParaDestino("2026-10-10", "2026-10-12", ["2026-10-10"])).toBe(false) // sí jugó el 10-10 (límite inferior incluido)
    expect(cacheFrescoParaDestino("2026-10-11", "2026-10-12", ["2026-10-10"])).toBe(true) // el 10-10 es anterior al rango
    expect(cacheFrescoParaDestino("2026-10-11", "2026-10-12", [])).toBe(true)
  })

  it("sorteos en el día destino o posteriores NO cuentan (no existían al calcular)", () => {
    expect(cacheFrescoParaDestino("2026-10-10", "2026-10-14", ["2026-10-14"])).toBe(true)
    expect(cacheFrescoParaDestino("2026-10-10", "2026-10-14", ["2026-10-15"])).toBe(true)
  })

  it("sorteos anteriores a la fecha del cache NO cuentan", () => {
    expect(cacheFrescoParaDestino("2026-10-10", "2026-10-14", ["2026-10-09", "2026-10-08"])).toBe(true)
  })

  it("compara fechas YYYY-MM-DD lexicográficamente (orden calendario correcto)", () => {
    expect(cacheFrescoParaDestino("2026-09-30", "2026-10-01", ["2026-09-30"])).toBe(false)
    expect(cacheFrescoParaDestino("2026-09-30", "2026-10-01", ["2026-10-01"])).toBe(true)
  })
})
