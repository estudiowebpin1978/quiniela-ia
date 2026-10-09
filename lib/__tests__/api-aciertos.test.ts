/**
 * Tests del mapeo predicción → aciertos de la API mis-predicciones.
 *
 * Regresión del bug reportado 2026-10-07: "mis análisis quedan en
 * 'Sin coincidencias' cuando muestra que sí las hubo".
 *
 * Casos tomados de datos REALES de producción (2026-10-06/07):
 *   - Nocturna 06/10: status NEAR_MISS, user_predictions.aciertos = [1,0]
 *     pero el historial tiene 5 coincidencias reales;
 *   - Matutina 06/10: status LOST con 1 coincidencia (84 → puesto 4);
 *   - 2 filas con centinela [3]/[9]/[19] en la columna aciertos.
 */
import { calcularAciertosApi, parseNumerosApi } from "@/lib/verificacion/api-aciertos"

const sorteo = [1084, 73, 17, 97, 25, 4, 66, 11, 47, 13, 78, 6, 30, 52, 61, 70, 88, 91, 5, 39]

describe("calcularAciertosApi", () => {
  it("usa el historial como fuente de verdad (5 coincidencias, no 1)", () => {
    const r = calcularAciertosApi({
      numeros: { "2": ["04", "73", "17", "97", "25", "60", "61", "62", "63", "64"] },
      premium: false,
      historial: {
        aciertos_2: [
          { numero: "04", puesto: 1 },
          { numero: "73", puesto: 7 },
          { numero: "17", puesto: 9 },
          { numero: "97", puesto: 6 },
          { numero: "25", puesto: 10 },
        ],
        aciertos_3: null,
        aciertos_4: null,
        resultado_oficial: sorteo,
      },
      numerosSorteo: sorteo,
    })
    expect(r.aciertos_2).toHaveLength(5)
    expect(r.todos).toHaveLength(5)
    // Coincidir ≠ ganar: acerto solo habla de coincidencias.
    expect(r.acerto).toBe(true)
    expect(r.resultado_2[0]).toBe("84")
  })

  it("acerto = hubo coincidencias aunque el status sea LOST (bug del badge)", () => {
    const r = calcularAciertosApi({
      numeros: ["84", "10", "20", "30", "40", "50", "60", "70", "80", "90"],
      premium: false,
      historial: {
        aciertos_2: [{ numero: "84", puesto: 4 }],
        aciertos_3: null,
        aciertos_4: null,
        resultado_oficial: sorteo,
      },
      numerosSorteo: sorteo,
    })
    expect(r.aciertos_2).toEqual([{ numero: "84", puesto: 4, tipo: 2 }])
    expect(r.acerto).toBe(true)
  })

  it("sin coincidencias → acerto false y listas vacías", () => {
    const r = calcularAciertosApi({
      numeros: ["11", "22", "33"],
      premium: false,
      historial: { aciertos_2: [], aciertos_3: null, aciertos_4: null, resultado_oficial: sorteo },
      numerosSorteo: sorteo,
    })
    expect(r.todos).toHaveLength(0)
    expect(r.acerto).toBe(false)
    expect(r.aciertos_2).toEqual([])
  })

  it("fallback sin historial: cruza picks × sorteo oficial (mismo matching)", () => {
    const r = calcularAciertosApi({
      numeros: ["84", "11", "99"],
      premium: false,
      historial: null,
      numerosSorteo: sorteo,
    })
    expect(r.aciertos_2).toEqual([
      { numero: "84", puesto: 1, tipo: 2 },
      { numero: "11", puesto: 8, tipo: 2 },
    ])
    expect(r.acerto).toBe(true)
    expect(r.resultado_2).toHaveLength(20)
  })

  it("3 cifras: solo con premium y usando el historial", () => {
    const base = {
      numeros: { "2": ["04"], "3": ["084"], "4": ["0084"] },
      historial: {
        aciertos_2: [{ numero: "04", puesto: 1 }],
        aciertos_3: [{ numero: "084", puesto: 1 }],
        aciertos_4: [{ numero: "0084", puesto: 1 }],
        resultado_oficial: sorteo,
      },
      numerosSorteo: sorteo,
    }
    const prem = calcularAciertosApi({ ...base, premium: true })
    expect(prem.aciertos_3).toHaveLength(1)
    expect(prem.aciertos_4).toHaveLength(1)
    expect(prem.todos).toHaveLength(3)

    const free = calcularAciertosApi({ ...base, premium: false })
    expect(free.aciertos_3).toHaveLength(0)
    expect(free.aciertos_4).toHaveLength(0)
    expect(free.numeros_3).toEqual([])
    // 3/4 cifras no cuentan para el free (no las ve), pero la coincidencia 2C sí
    expect(free.todos).toHaveLength(1)
    expect(free.acerto).toBe(true)
  })

  it("coincidencia SOLO de 3 cifras (caso de las 2 filas de prod) → acerto true con premium", () => {
    const r = calcularAciertosApi({
      numeros: { "2": ["11", "22"], "3": ["084"], "4": [] },
      premium: true,
      // historial: sin aciertos_2 (total_aciertos = 1 venía de 3C)
      historial: { aciertos_2: [], aciertos_3: [{ numero: "084", puesto: 1 }], aciertos_4: null, resultado_oficial: sorteo },
      numerosSorteo: sorteo,
    })
    expect(r.aciertos_2).toHaveLength(0)
    expect(r.aciertos_3).toHaveLength(1)
    expect(r.acerto).toBe(true)
  })

  it("acepta numeros como string-JSON envuelto en array (formato premium)", () => {
    const r = calcularAciertosApi({
      numeros: ['{"2":["84","11"],"3":[],"4":[],"r":[]}'],
      premium: false,
      historial: null,
      numerosSorteo: sorteo,
    })
    expect(r.numeros_2).toEqual(["84", "11"])
    expect(r.aciertos_2.map((a) => a.numero)).toEqual(["84", "11"])
  })

  it("sin historial y sin sorteo → nada calculado (no inventa coincidencias)", () => {
    const r = calcularAciertosApi({
      numeros: ["84", "11"],
      premium: false,
      historial: null,
      numerosSorteo: null,
    })
    expect(r.todos).toHaveLength(0)
    expect(r.acerto).toBe(false)
    expect(r.resultado_2).toEqual([])
  })

  it("historial sin resultado_oficial cae al sorteo para el resultado", () => {
    const r = calcularAciertosApi({
      numeros: ["84"],
      premium: false,
      historial: { aciertos_2: [{ numero: "84", puesto: 1 }], aciertos_3: null, aciertos_4: null, resultado_oficial: [] },
      numerosSorteo: sorteo,
    })
    expect(r.resultado_2[0]).toBe("84")
    expect(r.acerto).toBe(true)
  })

  it("predicción de UN número no pierde el pick (el array no es envoltorio JSON)", () => {
    const r = calcularAciertosApi({
      numeros: ["84"],
      premium: false,
      historial: null,
      numerosSorteo: sorteo,
    })
    expect(r.numeros_2).toEqual(["84"])
    expect(r.aciertos_2).toEqual([{ numero: "84", puesto: 1, tipo: 2 }])
    expect(r.acerto).toBe(true)
  })

  it("descarta entradas no numéricas en vez de convertirlas en cifras", () => {
    const r = calcularAciertosApi({
      numeros: { "2": ["84", "ab", "", null] },
      premium: false,
      historial: null,
      numerosSorteo: sorteo,
    })
    expect(r.numeros_2).toEqual(["84"])
    expect(r.aciertos_2).toHaveLength(1)
  })
})

describe("parseNumerosApi", () => {
  it("conserva el array plano de picks", () => {
    expect(parseNumerosApi([4, 84])).toEqual([4, 84])
  })
  it("parsea string-JSON envuelto", () => {
    expect(parseNumerosApi(['{"2":["01"]}'])).toEqual({ "2": ["01"] })
  })
  it("JSON inválido del envoltorio → sin cifras (fail-closed, no inventa)", () => {
    expect(parseNumerosApi(['{"2":["84"'])).toEqual({})
  })
  it("falla a objeto vacío con basura (no inventa cifras)", () => {
    expect(parseNumerosApi("000s")).toEqual({})
    expect(parseNumerosApi(null)).toEqual({})
    expect(parseNumerosApi(undefined)).toEqual({})
  })
})

/**
 * Regresión del bug reportado 2026-10-09: "la comparación con datos oficiales
 * muestra 3 y 4 cifras en Poceada, pero Poceada solo tiene 2 cifras (00-99)".
 * Quiniela y Poceada son 2 sorteos distintos → con esPoceada solo se compara
 * en 2 cifras.
 */
describe("calcularAciertosApi — esPoceada (solo 2 cifras, 00-99)", () => {
  // Sorteo de Poceada real: 20 números de 00 a 99.
  const sorteoPoceada = [7, 12, 45, 3, 88, 61, 20, 99, 34, 56, 1, 78, 42, 90, 15, 67, 23, 54, 81, 9]

  it("objeto legacy con claves 3/4 en Poceada → se ignoran (solo 2 cifras)", () => {
    const r = calcularAciertosApi({
      // Predicción mal guardada (legacy) como objeto con 3/4 cifras.
      numeros: { "2": ["07", "12", "45"], "3": ["007", "012"], "4": ["0007"] },
      premium: true,
      historial: null,
      numerosSorteo: sorteoPoceada,
      esPoceada: true,
    })
    expect(r.numeros_3).toEqual([])
    expect(r.numeros_4).toEqual([])
    expect(r.aciertos_3).toEqual([])
    expect(r.aciertos_4).toEqual([])
    // Los aciertos 2 siguen calculándose normalmente.
    expect(r.aciertos_2.length).toBeGreaterThan(0)
    expect(r.todos).toEqual(r.aciertos_2)
  })

  it("resultado_3 y resultado_4 vacíos (no se derivan '000'..'099')", () => {
    const r = calcularAciertosApi({
      numeros: ["07", "12", "45", "03", "88", "61", "20", "99"],
      premium: true,
      historial: null,
      numerosSorteo: sorteoPoceada,
      esPoceada: true,
    })
    expect(r.resultado_3).toEqual([])
    expect(r.resultado_4).toEqual([])
    expect(r.resultado_2).toHaveLength(20)
    expect(r.resultado_2.every((s) => /^\d{2}$/.test(s))).toBe(true)
  })

  it("historial con aciertos_3/4 heredados en Poceada → se descartan", () => {
    const r = calcularAciertosApi({
      numeros: ["07", "12", "45"],
      premium: true,
      historial: {
        aciertos_2: [{ numero: "07", puesto: 1 }],
        aciertos_3: [{ numero: "007", puesto: 1 }],
        aciertos_4: [{ numero: "0007", puesto: 1 }],
        resultado_oficial: sorteoPoceada,
      },
      numerosSorteo: sorteoPoceada,
      esPoceada: true,
    })
    expect(r.aciertos_3).toEqual([])
    expect(r.aciertos_4).toEqual([])
    expect(r.aciertos_2).toHaveLength(1)
    expect(r.todos).toHaveLength(1)
  })

  it("sin esPoceada (Quiniela) sí se derivan 3/4 cifras — no rompe el caso normal", () => {
    const r = calcularAciertosApi({
      numeros: { "2": ["84"], "3": ["084"], "4": ["1084"] },
      premium: true,
      historial: null,
      numerosSorteo: sorteo,
      esPoceada: false,
    })
    expect(r.resultado_3).toHaveLength(20)
    expect(r.resultado_4).toHaveLength(20)
    expect(r.aciertos_4).toHaveLength(1) // 1084 es el 1er número del sorteo
  })
})
