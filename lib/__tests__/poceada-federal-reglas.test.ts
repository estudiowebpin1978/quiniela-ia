import { describe, it, expect } from "vitest"
import {
  periodoART,
  loteriaNocturnaRigente,
  nombreMes,
  etiquetaLoteriaNocturna,
} from "@/lib/poceada-federal/reglas"

describe("loteriaNocturnaRigente (alternancia oficial por mes)", () => {
  it("meses impares → Quiniela Nocturna de Santa Fe", () => {
    for (const mes of [1, 3, 5, 7, 9, 11]) {
      expect(loteriaNocturnaRigente(mes)).toBe("santa-fe")
    }
  })

  it("meses pares → Tómbola / Quiniela Nocturna de Entre Ríos", () => {
    for (const mes of [2, 4, 6, 8, 10, 12]) {
      expect(loteriaNocturnaRigente(mes)).toBe("entre-rios")
    }
  })

  it("rechaza meses fuera de rango o no enteros", () => {
    expect(() => loteriaNocturnaRigente(0)).toThrow()
    expect(() => loteriaNocturnaRigente(13)).toThrow()
    expect(() => loteriaNocturnaRigente(2.5)).toThrow()
    expect(() => loteriaNocturnaRigente(NaN)).toThrow()
  })
})

describe("periodoART (mes/año en horario de Buenos Aires)", () => {
  it("fecha normal dentro del mes", () => {
    expect(periodoART(new Date("2026-10-14T12:00:00Z"))).toEqual({ mes: 10, anio: 2026 })
  })

  it("cruce de mes: cerca de medianoche UTC sigue siendo octubre en ART (UTC−3)", () => {
    // 2026-11-01 02:59Z = 2026-10-31 23:59 ART → sigue siendo octubre
    expect(periodoART(new Date("2026-11-01T02:59:00Z"))).toEqual({ mes: 10, anio: 2026 })
    // 2026-11-01 03:01Z = 2026-11-01 00:01 ART → ya es noviembre
    expect(periodoART(new Date("2026-11-01T03:01:00Z"))).toEqual({ mes: 11, anio: 2026 })
  })

  it("cruce de año: 1 de enero UTC madrugada sigue siendo diciembre en ART", () => {
    expect(periodoART(new Date("2027-01-01T02:00:00Z"))).toEqual({ mes: 12, anio: 2026 })
    expect(periodoART(new Date("2027-01-01T04:00:00Z"))).toEqual({ mes: 1, anio: 2027 })
  })
})

describe("nombreMes / etiquetaLoteriaNocturna", () => {
  it("nombres de meses en español", () => {
    expect(nombreMes(1)).toBe("enero")
    expect(nombreMes(10)).toBe("octubre")
    expect(nombreMes(12)).toBe("diciembre")
    expect(() => nombreMes(0)).toThrow()
  })

  it("etiquetas exactas de las loterías rigentes", () => {
    expect(etiquetaLoteriaNocturna("santa-fe")).toBe("Quiniela Nocturna de Santa Fe")
    expect(etiquetaLoteriaNocturna("entre-rios")).toBe("Tómbola / Quiniela Nocturna de Entre Ríos")
  })
})
