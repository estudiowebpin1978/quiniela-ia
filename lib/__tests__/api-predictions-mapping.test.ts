/**
 * Tests de mapApiPredictionCard (API → tarjeta /pronostico/[fecha]).
 *
 * Regresión del bug 2026-10-14: la tarjeta mostraba cifras2 vacío,
 * "Confianza: 0.6%" (consistencia 0-1 leída como 0-100) y TurnoSummary
 * crasheaba con .padStart sobre undefined; la redoblona llegaba como
 * string "cc-aa" y la tarjeta hacía .join (esperaba tupla).
 */
import { describe, it, expect } from "vitest"
import { mapApiPredictionCard } from "@/lib/api/predictions"

describe("mapApiPredictionCard", () => {
  // Fixture del path cache (GET/POST cache-first): confidence 0-1,
  // redoblona string "cc-aa", números bajo pred.
  const cacheResponse = {
    engine: "meta-ensemble-v1",
    confidence: 0.6,
    pred: {
      numeros_2: ["73", "02", "23", "24", "43"],
      numeros_3: ["730", "020"],
      numeros_4: ["7302", "0200"],
      redoblona: "73-02",
    },
    numeros: [
      {
        numero: "73",
        score: 0.41,
        factor_attribution: { hot: 0.85, gap: 0.028, atraso: 17 },
      },
      { numero: "02", score: 0.4 },
    ],
    turno: "Nocturna",
  }

  it("path cache: cifras2, confianza 0-1→0-100 y redoblona string→tupla", () => {
    const out = mapApiPredictionCard(cacheResponse, "Nocturna")
    expect(out.cifras2).toBe("73")
    expect(out.cifras3).toBe("730")
    expect(out.cifras4).toBe("7302")
    expect(out.confidence).toBe(60)
    expect(out.redoblona).toEqual(["73", "02"])
    expect(out.turno).toBe("Nocturna")
  })

  it("factores: solo pesos 0-1 reales del top-1, ordenados desc", () => {
    const out = mapApiPredictionCard(cacheResponse, "Nocturna")
    // atraso=17 queda filtrado (no es proporción) y hot > gap
    expect(out.factores).toEqual([
      { name: "hot", value: 0.85 },
      { name: "gap", value: 0.028 },
    ])
  })

  it("path V6 vivo: confidence null → 0 (s/d), redoblona null → undefined", () => {
    const out = mapApiPredictionCard(
      {
        engine: "omega-v6",
        confidence: null,
        pred: {
          numeros_2: ["11", "22"],
          numeros_3: [],
          numeros_4: [],
          redoblona: null,
        },
        numeros: [],
        turno: "Matutina",
      },
      "Matutina",
    )
    expect(out.confidence).toBe(0)
    expect(out.redoblona).toBeUndefined()
    expect(out.cifras3).toBeUndefined()
    expect(out.cifras4).toBeUndefined()
    expect(out.cifras2).toBe("11")
  })

  it("tier free: sin numeros_3/numeros_4 → campos ocultos (no inventados)", () => {
    const out = mapApiPredictionCard(
      { pred: { numeros_2: ["05"] }, confidence: 0.7, numeros: [], turno: "Primera" },
      "Primera",
    )
    expect(out.cifras2).toBe("05")
    expect(out.cifras3).toBeUndefined()
    expect(out.cifras4).toBeUndefined()
    expect(out.redoblona).toBeUndefined()
  })

  it("fallback a campos top-level si no vienen bajo pred", () => {
    const out = mapApiPredictionCard(
      {
        numeros_2: ["88"],
        numeros_3: ["888"],
        redoblona: ["88", "12"],
        confidence: 0.5,
        numeros: [],
      },
      "Vespertina",
    )
    expect(out.cifras2).toBe("88")
    expect(out.cifras3).toBe("888")
    expect(out.redoblona).toEqual(["88", "12"])
    expect(out.confidence).toBe(50)
    // sin turno en la respuesta → fallback del query
    expect(out.turno).toBe("Vespertina")
  })

  it("confidence ya en 0-100 se respeta (defensivo, sin doble escala)", () => {
    const out = mapApiPredictionCard({ confidence: 60, pred: { numeros_2: ["01"] } }, "Previa")
    expect(out.confidence).toBe(60)
  })

  it("entradas basura no lanzan: campos vacíos y confidence 0", () => {
    for (const junk of [null, undefined, "texto", 42, {}, { pred: null, confidence: "x" }]) {
      const out = mapApiPredictionCard(junk, "Nocturna")
      expect(out.cifras2).toBe("")
      expect(out.confidence).toBe(0)
      expect(out.redoblona).toBeUndefined()
      expect(out.factores).toBeUndefined()
      expect(out.turno).toBe("Nocturna")
    }
  })
})
