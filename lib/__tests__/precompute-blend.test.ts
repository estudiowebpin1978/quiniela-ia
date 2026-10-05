import { describe, it, expect } from "vitest"
import {
  blendCandidatos,
  blendEngines,
  calcularConfianza,
  construirRedoblona,
  diversifyMMR,
  formatCifras,
  formatNumero,
  LAMBDA_MMR,
  mapearCandidatosV6,
  mlToBlended,
  numerosTop,
  redondear,
  v7ToBlended,
} from "../pipeline/precompute/blend"
import type { BlendedPrediction, EngineWeights } from "../pipeline/precompute/blend"

// Pesos exactos en binario (0.5 / 0.25) para poder hacer expectativas exactas
const PESOS: EngineWeights = { V6: 0.5, V7: 0.25, ML: 0.25 }

const pred = (
  n: number,
  score: number,
  factor_attribution: Record<string, number> = {},
): BlendedPrediction => ({ n, numero: formatNumero(n), score, factor_attribution })

describe("redondear", () => {
  it("replica exactamente las fórmulas inline originales", () => {
    expect(redondear(0.123456789, 3)).toBe(Math.round(0.123456789 * 1000) / 1000)
    expect(redondear(0.4000000000000001, 4)).toBe(Math.round(0.4000000000000001 * 10000) / 10000)
    expect(redondear(0.7499, 2)).toBe(Math.round(0.7499 * 100) / 100)
    expect(redondear(0.5, 2)).toBe(Math.round(0.5 * 100) / 100)
  })

  it("redondea a la cantidad de decimales pedida", () => {
    expect(redondear(0.99999, 3)).toBe(1)
    expect(redondear(123.456, 2)).toBe(123.46)
    expect(redondear(4.567, 0)).toBe(5)
    expect(redondear(0, 4)).toBe(0)
  })
})

describe("formatNumero", () => {
  it("pone cero a la izquierda solo cuando corresponde", () => {
    expect(formatNumero(0)).toBe("00")
    expect(formatNumero(7)).toBe("07")
    expect(formatNumero(43)).toBe("43")
    expect(formatNumero(999)).toBe("999")
  })
})

describe("v7ToBlended", () => {
  it("convierte Prediction[] a shape de blend", () => {
    const out = v7ToBlended([
      { numero: "07", score: 0.5 },
      { numero: "43", score: 0.25 },
    ])
    expect(out).toEqual([
      { n: 7, numero: "07", score: 0.5, factor_attribution: {} },
      { n: 43, numero: "43", score: 0.25, factor_attribution: {} },
    ])
  })

  it("lista vacía → lista vacía", () => {
    expect(v7ToBlended([])).toEqual([])
  })

  it("es determinista y no muta la entrada", () => {
    const input = [{ numero: "12", score: 0.3 }]
    const copia = JSON.parse(JSON.stringify(input))
    expect(v7ToBlended(input)).toEqual(v7ToBlended(input))
    expect(input).toEqual(copia)
  })
})

describe("mlToBlended", () => {
  it("ordena por score desc, toma 10 y formatea a 2 cifras", () => {
    const scores = new Map<number, number>([
      [42, 0.1],
      [7, 0.9],
      [61, 0.5],
    ])
    expect(mlToBlended(scores)).toEqual([
      { n: 7, numero: "07", score: 0.9, factor_attribution: {} },
      { n: 61, numero: "61", score: 0.5, factor_attribution: {} },
      { n: 42, numero: "42", score: 0.1, factor_attribution: {} },
    ])
  })

  it("recorta a los 10 mejores aunque haya más números", () => {
    const scores = new Map<number, number>()
    for (let i = 0; i < 30; i++) scores.set(i, i / 100)
    const out = mlToBlended(scores)
    expect(out).toHaveLength(10)
    expect(out[0].n).toBe(29)
    expect(out[9].n).toBe(20)
  })

  it("scores vacíos → lista vacía (el guard del route sale por acá)", () => {
    expect(mlToBlended(new Map())).toEqual([])
  })

  it("es determinista con empates (orden de inserción)", () => {
    const a = new Map<number, number>([
      [1, 0.5],
      [2, 0.5],
      [3, 0.5],
    ])
    expect(mlToBlended(a).map((p) => p.n)).toEqual([1, 2, 3])
    expect(mlToBlended(a)).toEqual(mlToBlended(a))
  })
})

describe("numerosTop", () => {
  it("toma los primeros 10 de cada motor", () => {
    const v6Rows = Array.from({ length: 15 }, (_, i) => ({ numero: i + 1, puntaje_total: 10 - i }))
    const v7 = Array.from({ length: 15 }, (_, i) => pred(i + 1, 1))
    const ml = Array.from({ length: 15 }, (_, i) => pred(i + 1, 1))
    const top = numerosTop(v6Rows, v7, ml)
    expect(top.v6).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(top.v7).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(top.ml).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it("V6 sin filas (RPC falló) → arreglo vacío", () => {
    expect(numerosTop(null, [], []).v6).toEqual([])
    expect(numerosTop(undefined, [], []).v6).toEqual([])
  })
})

describe("blendEngines", () => {
  it("suma scores ponderados por motor (V6 existente + V7/ML encima)", () => {
    const out = blendEngines({
      v6Rows: [{ numero: 5, puntaje_total: 10, factor_attribution: { freq: 0.8 } }],
      v7Predictions: [pred(5, 2), pred(7, 4)],
      mlPredictions: [pred(5, 4), pred(9, 8)],
      engineWeights: PESOS,
    })
    // 5: V6 10*0.5=5 + V7 2*0.25=0.5 + ML 4*0.25=1 → 6.5
    expect(out[0].n).toBe(5)
    expect(out[0].score).toBe(6.5)
    expect(out[0].factor_attribution).toEqual({ freq: 0.8 })
    // 7: solo V7 → 4*0.25=1 ; 9: solo ML → 8*0.25=2
    expect(out[1].n).toBe(9)
    expect(out[1].score).toBe(2)
    expect(out[2].n).toBe(7)
    expect(out[2].score).toBe(1)
    expect(out).toHaveLength(3)
  })

  it("respeta los pesos originales del route (0.40 / 0.35 / 0.25)", () => {
    const out = blendEngines({
      v6Rows: [{ numero: 11, puntaje_total: 10 }],
      v7Predictions: [pred(11, 10)],
      mlPredictions: [pred(11, 10)],
      engineWeights: { V6: 0.40, V7: 0.35, ML: 0.25 },
    })
    expect(out).toHaveLength(1)
    expect(out[0].score).toBeCloseTo(4 + 3.5 + 2.5, 10)
  })

  it("sin motores → lista vacía (guard 'All engines produced empty predictions')", () => {
    expect(blendEngines({ v6Rows: null, v7Predictions: [], mlPredictions: [], engineWeights: PESOS })).toEqual([])
    expect(blendEngines({ v6Rows: [], v7Predictions: [], mlPredictions: [], engineWeights: PESOS })).toEqual([])
  })

  it("pesos en cero → todos los scores en 0 pero se conservan los números", () => {
    const out = blendEngines({
      v6Rows: [{ numero: 3, puntaje_total: 100 }, { numero: 4, puntaje_total: 50 }],
      v7Predictions: [pred(7, 1)],
      mlPredictions: [pred(8, 1)],
      engineWeights: { V6: 0, V7: 0, ML: 0 },
    })
    expect(out.map((p) => p.n).sort((a, b) => a - b)).toEqual([3, 4, 7, 8])
    expect(out.every((p) => p.score === 0)).toBe(true)
  })

  it("V6 solo aporta sus primeras 20 filas", () => {
    const v6Rows = Array.from({ length: 25 }, (_, i) => ({
      numero: i + 1,
      puntaje_total: i < 20 ? i + 1 : 1000, // las descartadas puntuarían altísimo
    }))
    const out = blendEngines({ v6Rows, v7Predictions: [], mlPredictions: [], engineWeights: { V6: 1, V7: 0, ML: 0 } })
    expect(out.map((p) => p.n)).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11])
    expect(out.some((p) => p.n === 25)).toBe(false)
  })

  it("número repetido en V6: gana la última fila (set sobrescribe)", () => {
    const out = blendEngines({
      v6Rows: [
        { numero: 7, puntaje_total: 1 },
        { numero: 7, puntaje_total: 5 },
      ],
      v7Predictions: [],
      mlPredictions: [],
      engineWeights: { V6: 1, V7: 0, ML: 0 },
    })
    expect(out).toHaveLength(1)
    expect(out[0].score).toBe(5)
  })

  it("V6 sin puntaje_total ni factor_attribution usa 0 y {}", () => {
    const out = blendEngines({
      v6Rows: [{ numero: 12 }],
      v7Predictions: [],
      mlPredictions: [],
      engineWeights: PESOS,
    })
    expect(out[0].score).toBe(0)
    expect(out[0].factor_attribution).toEqual({})
  })

  it("devuelve como máximo 10 predicciones ordenadas por score desc", () => {
    const v6Rows = Array.from({ length: 30 }, (_, i) => ({ numero: i + 1, puntaje_total: 31 - i }))
    const out = blendEngines({ v6Rows, v7Predictions: [], mlPredictions: [], engineWeights: { V6: 1, V7: 0, ML: 0 } })
    expect(out).toHaveLength(10)
    const scores = out.map((p) => p.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(out.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it("es determinista: misma entrada → misma salida y no muta las entradas", () => {
    const params = {
      v6Rows: [{ numero: 5, puntaje_total: 10, factor_attribution: { freq: 0.8 } }],
      v7Predictions: [pred(5, 2), pred(7, 4)],
      mlPredictions: [pred(5, 4), pred(9, 8)],
      engineWeights: PESOS,
    }
    const v7Copia = JSON.parse(JSON.stringify(params.v7Predictions))
    const mlCopia = JSON.parse(JSON.stringify(params.mlPredictions))
    const v6Copia = JSON.parse(JSON.stringify(params.v6Rows))

    const a = blendEngines(params)
    const b = blendEngines(params)
    expect(a).toEqual(b)
    expect(params.v7Predictions).toEqual(v7Copia)
    expect(params.mlPredictions).toEqual(mlCopia)
    expect(params.v6Rows).toEqual(v6Copia)
  })
})

describe("diversifyMMR", () => {
  const base = [pred(1, 10), pred(2, 5), pred(3, 2)]

  it("ratio de diversidad = (max - min) / max y nota aceptable", () => {
    const res = diversifyMMR(base)
    expect(res.diversityRatio).toBeCloseTo((10 - 2) / 10, 10)
    expect(res.diversityNote).toBe("Diversidad aceptable.")
  })

  it("con puntajes casi iguales detecta baja diversidad y usa el mensaje exacto", () => {
    const res = diversifyMMR([pred(1, 10), pred(2, 10), pred(3, 9.95)])
    expect(res.diversityRatio).toBeCloseTo(0.05 / 10, 10)
    expect(res.diversityRatio).toBeLessThan(0.05)
    expect(res.diversityNote).toBe(
      "BAJA DIVERSIDAD: MMR determinista aplicado (lambda=0.7, basado en factor_attribution).",
    )
  })

  it("devuelve todos los elementos (permutación) cuando hay 10 o menos", () => {
    const res = diversifyMMR(base)
    expect(res.seleccion).toHaveLength(3)
    expect(res.seleccion.map((p) => p.n).sort()).toEqual([1, 2, 3])
  })

  it("lambda = 0.7 por defecto (constante exportada)", () => {
    expect(LAMBDA_MMR).toBe(0.7)
  })

  it("prefiere diversificar por factor_attribution aunque baje el score", () => {
    // A (10, fa igual a B) vs B (9.9, fa idéntica a A) vs C (8, fa opuesta):
    // similitud de B con A = 1 → MMR de B cae; C gana el segundo lugar.
    const items = [
      pred(1, 10, { x: 1 }),
      pred(2, 9.9, { x: 1 }),
      pred(3, 8, { x: 0 }),
    ]
    const res = diversifyMMR(items)
    expect(res.seleccion.map((p) => p.n)).toEqual([1, 3, 2])
  })

  it("similitud 0 cuando no comparten ningún factor (keys.length === 0)", () => {
    const items = [pred(1, 10, { a: 1 }), pred(2, 1, { b: 1 })]
    const res = diversifyMMR(items)
    expect(res.seleccion.map((p) => p.n)).toEqual([1, 2])
    // mmr del 2º = 0.7 * (1/10) - 0.3 * 0
    expect(res.seleccion[1].score).toBe(1)
  })

  it("lista vacía → ratio 1 y selección vacía", () => {
    const res = diversifyMMR([])
    expect(res.seleccion).toEqual([])
    expect(res.diversityRatio).toBe(1)
    expect(res.diversityNote).toBe("Diversidad aceptable.")
  })

  it("es determinista y no muta la entrada", () => {
    const copia = JSON.parse(JSON.stringify(base))
    const a = diversifyMMR(base)
    const b = diversifyMMR(base)
    expect(a.seleccion.map((p) => p.n)).toEqual(b.seleccion.map((p) => p.n))
    expect(a.diversityRatio).toBe(b.diversityRatio)
    expect(base).toEqual(copia)
  })
})

describe("mapearCandidatosV6", () => {
  it("mapea numero/puntaje_total y num_val/score_val", () => {
    const rows = [
      { numero: 123, puntaje_total: 4 },
      { num_val: 456, score_val: 9 },
    ]
    expect(mapearCandidatosV6(rows)).toEqual([
      { numero: 123, v6Score: 4 },
      { numero: 456, v6Score: 9 },
    ])
  })

  it("score ausente o 0 → 0", () => {
    expect(mapearCandidatosV6([{ numero: 7 }])).toEqual([{ numero: 7, v6Score: 0 }])
    expect(mapearCandidatosV6([{ numero: 7, score_val: 0, puntaje_total: 99 }])).toEqual([
      { numero: 7, v6Score: 0 },
    ])
    expect(mapearCandidatosV6([{ numero: 7, score_val: null, puntaje_total: 99 }])).toEqual([
      { numero: 7, v6Score: 99 },
    ])
  })

  it("recorta a los 30 primeros candidatos", () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({ numero: i, puntaje_total: 40 - i }))
    expect(mapearCandidatosV6(rows)).toHaveLength(30)
    expect(mapearCandidatosV6(rows)[29].numero).toBe(29)
  })

  it("sin filas (RPC con error) → lista vacía", () => {
    expect(mapearCandidatosV6(null)).toEqual([])
    expect(mapearCandidatosV6(undefined)).toEqual([])
  })
})

describe("blendCandidatos", () => {
  it("score = v6*W6 + v7*W7 + ml*WML con ausentes en 0", () => {
    const out = blendCandidatos(
      [{ numero: 123, v6Score: 4 }, { numero: 456, v6Score: 8 }],
      new Map([[123, 4]]),
      new Map([[456, 8]]),
      PESOS,
    )
    // 123: 4*0.5 + 4*0.25 + 0 = 3 ; 456: 8*0.5 + 0 + 8*0.25 = 6
    expect(out).toEqual([
      { numero: 456, score: 6 },
      { numero: 123, score: 3 },
    ])
  })

  it("ordena por score desc (empates mantienen el orden de entrada)", () => {
    const out = blendCandidatos(
      [{ numero: 1, v6Score: 5 }, { numero: 2, v6Score: 5 }],
      new Map(),
      new Map(),
      PESOS,
    )
    expect(out.map((c) => c.numero)).toEqual([1, 2])
  })

  it("sin candidatos → lista vacía", () => {
    expect(blendCandidatos([], new Map(), new Map(), PESOS)).toEqual([])
  })

  it("es determinista: misma entrada → misma salida", () => {
    const cands = [{ numero: 9, v6Score: 3 }]
    const v7 = new Map([[9, 2]])
    const ml = new Map([[9, 1]])
    expect(blendCandidatos(cands, v7, ml, PESOS)).toEqual(blendCandidatos(cands, v7, ml, PESOS))
  })
})

describe("formatCifras", () => {
  it("pone padding de 3 y 4 cifras", () => {
    expect(formatCifras([{ numero: 7, score: 1 }, { numero: 123, score: 0 }], 3)).toEqual(["007", "123"])
    expect(formatCifras([{ numero: 42, score: 1 }], 4)).toEqual(["0042"])
  })

  it("no trunca si el número ya supera el ancho pedido", () => {
    expect(formatCifras([{ numero: 12345, score: 1 }], 3)).toEqual(["12345"])
  })

  it("recorta a 10 y acepta listas vacías", () => {
    const doce = Array.from({ length: 12 }, (_, i) => ({ numero: i, score: 12 - i }))
    expect(formatCifras(doce, 3)).toHaveLength(10)
    expect(formatCifras([], 3)).toEqual([])
  })
})

describe("construirRedoblona", () => {
  it("cabeza + acompañante con padding a 2 cifras", () => {
    expect(construirRedoblona([5, 7])).toEqual({ cabeza: "05", acompanante: "07" })
    expect(construirRedoblona([43, 88])).toEqual({ cabeza: "43", acompanante: "88" })
  })

  it("null con menos de 2 números", () => {
    expect(construirRedoblona([])).toBeNull()
    expect(construirRedoblona([5])).toBeNull()
  })
})

describe("calcularConfianza", () => {
  it("agreement total: consistencia = 0.5*histórico + 0.5*1", () => {
    const res = calcularConfianza({ v6: [1, 2, 3], v7: [1, 2, 3], ml: [] }, 50)
    expect(res.agreement).toBe(1)
    expect(res.modelConsistency).toBe(0.75)
  })

  it("agreement parcial (2 de 4)", () => {
    const res = calcularConfianza({ v6: [1, 2, 3, 4], v7: [1, 2], ml: [9] }, 100)
    expect(res.agreement).toBe(0.5)
    expect(res.modelConsistency).toBe(0.75)
  })

  it("sin solapamiento → agreement 0", () => {
    const res = calcularConfianza({ v6: [1, 2, 3, 4, 5], v7: [6], ml: [7] }, 100)
    expect(res.agreement).toBe(0)
    expect(res.modelConsistency).toBe(0.5)
  })

  it("V6 vacío → agreement 0 (división protegida con max(size, 1))", () => {
    const res = calcularConfianza({ v6: [], v7: [1], ml: [2] }, 100)
    expect(res.agreement).toBe(0)
    expect(res.modelConsistency).toBe(0.5)
  })

  it("histórico acotado a 100 sorteos", () => {
    expect(calcularConfianza({ v6: [1], v7: [1], ml: [] }, 5000).modelConsistency).toBe(1)
    expect(calcularConfianza({ v6: [1], v7: [1], ml: [] }, 0).modelConsistency).toBe(0.5)
    expect(calcularConfianza({ v6: [1], v7: [], ml: [] }, 0).modelConsistency).toBe(0)
  })

  it("solo mira los primeros 10 de cada motor (duplicados no cuentan)", () => {
    const v6 = Array.from({ length: 15 }, (_, i) => i + 1) // 1..15
    const v7 = Array.from({ length: 5 }, (_, i) => i + 11) // 11..15 → fuera del top-10
    expect(calcularConfianza({ v6, v7, ml: [] }, 100).agreement).toBe(0)
    expect(calcularConfianza({ v6: [7, 7, 7], v7: [7], ml: [] }, 100).agreement).toBe(1)
  })

  it("es determinista: misma entrada → misma salida", () => {
    const top = { v6: [1, 2, 3], v7: [2, 3, 4], ml: [3] }
    expect(calcularConfianza(top, 80)).toEqual(calcularConfianza(top, 80))
  })
})
