import { describe, it, expect } from "vitest"
import {
  TODOS_TURNOS,
  normalizeTurno,
  toStrArray,
  parseNumeros,
  deriveNums,
  matchearAciertos,
  estadoQuiniela,
  estadoFinal,
  posicionesDe,
  type HistoryInsert,
} from "../verificacion/criterio"
import { buildHistoryInsert } from "../verificacion/historial"
import { esDiaSinSorteo, esFeriado, esTurnoSinSorteo } from "../feriados"

const GAME_ID_NACIONAL = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
const GAME_ID_POCEADA = "d0e1f2a3-b4c5-6789-0abc-def012345678"

function hist(partial: Partial<HistoryInsert>): HistoryInsert {
  return {
    prediction_id: "p1",
    user_id: "u1",
    date: "2026-10-05",
    turno: "Matutina",
    numeros_2: [],
    numeros_3: [],
    numeros_4: [],
    redoblonas: [],
    resultado_oficial: [],
    aciertos_2: [],
    aciertos_3: [],
    aciertos_4: [],
    aciertos_redoblona: [],
    total_aciertos: 0,
    verified: true,
    verified_at: "2026-10-05T18:00:00.000Z",
    game_id: GAME_ID_NACIONAL,
    ...partial,
  }
}

describe("turnos canónicos", () => {
  it("TODOS_TURNOS son los 6 turnos oficiales en orden", () => {
    expect([...TODOS_TURNOS]).toEqual(["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"])
  })

  it("normalizeTurno acepta variantes sufijo/mayúsculas/espacios", () => {
    expect(normalizeTurno("Matutina")).toBe("Matutina")
    expect(normalizeTurno("Matutina-2cifras")).toBe("Matutina")
    expect(normalizeTurno("Matutina-3cifra")).toBe("Matutina")
    expect(normalizeTurno("matutina")).toBe("Matutina")
    expect(normalizeTurno("  poceada ")).toBe("Poceada")
    expect(normalizeTurno("")).toBe("")
  })
})

describe("estadoQuiniela (criterio estricto: cabeza / ±1)", () => {
  const draw = [1234, 8804, 6095] // cabeza = "34"

  it("WON si la cabeza (mod 100, pad 2) está en los 2-cifras", () => {
    expect(estadoQuiniela(draw, ["34"])).toBe("WON")
    expect(estadoQuiniela(draw, ["01", "34", "77"])).toBe("WON")
  })

  it("NEAR_MISS por cabeza +1 o -1", () => {
    expect(estadoQuiniela(draw, ["35"])).toBe("NEAR_MISS") // 34 + 1
    expect(estadoQuiniela(draw, ["33"])).toBe("NEAR_MISS") // 34 - 1
  })

  it("NEAR_MISS con wrap 00↔99", () => {
    // cabeza "00" (draw con primer número múltiplo de 100)
    expect(estadoQuiniela([100], ["99"])).toBe("NEAR_MISS") // 00 - 1 → 99
    expect(estadoQuiniela([100], ["01"])).toBe("NEAR_MISS") // 00 + 1 → 01
    // cabeza "99"
    expect(estadoQuiniela([99], ["00"])).toBe("NEAR_MISS") // 99 + 1 → 00
  })

  it("LOST si no hay cabeza ni ±1, o entradas vacías", () => {
    expect(estadoQuiniela(draw, ["50", "51"])).toBe("LOST")
    expect(estadoQuiniela([], ["34"])).toBe("LOST")
    expect(estadoQuiniela(draw, [])).toBe("LOST")
  })
})

describe("deriveNums (2C/3C/4C oficiales)", () => {
  it("deriva con padStart según la cifra", () => {
    const { nums2, nums3, nums4 } = deriveNums([4661, 8804, 5])
    expect(nums2).toEqual(["61", "04", "05"])
    expect(nums3).toEqual(["661", "804", "005"])
    expect(nums4).toEqual(["4661", "8804", "0005"])
  })
})

describe("parseNumeros (formatos de user_predictions.numeros)", () => {
  it("array plano → solo 2-cifras con pad", () => {
    expect(parseNumeros([1, 22, "5"])).toEqual({
      numeros_2: ["01", "22", "05"],
      numeros_3: [],
      numeros_4: [],
      redoblonas: [],
    })
  })

  it("string JSON envuelto en array → objeto de cifras", () => {
    const raw = ['{"2":["34","56"],"3":["034"],"4":["0034"],"r":["34-56"]}']
    const p = parseNumeros(raw)
    expect(p.numeros_2).toEqual(["34", "56"])
    expect(p.numeros_3).toEqual(["034"])
    expect(p.numeros_4).toEqual(["0034"])
    expect(p.redoblonas).toEqual(["34-56"])
  })

  it("objeto directo con valores string-coma", () => {
    const p = parseNumeros({ "2": "34,56" })
    expect(p.numeros_2).toEqual(["34", "56"])
  })

  it("null / string inválido → todo vacío", () => {
    expect(parseNumeros(null)).toEqual({ numeros_2: [], numeros_3: [], numeros_4: [], redoblonas: [] })
    expect(parseNumeros("no-json")).toEqual({ numeros_2: [], numeros_3: [], numeros_4: [], redoblonas: [] })
  })
})

describe("toStrArray", () => {
  it("array / string-coma / null", () => {
    expect(toStrArray([1, null, 2])).toEqual(["1", "2"])
    expect(toStrArray("a, b ,")).toEqual(["a", "b"])
    expect(toStrArray(null)).toEqual([])
    expect(toStrArray(42)).toEqual([])
  })
})

describe("matchearAciertos (2C / 3C / 4C / redoblona)", () => {
  const draw = deriveNums([4661, 8804, 6095, 77])

  it("2C: match con puesto base 1", () => {
    const m = matchearAciertos(parseNumeros([61, 99]), draw)
    expect(m.aciertos_2).toEqual([{ numero: "61", puesto: 1 }])
    expect(m.total_aciertos).toBe(1)
  })

  it("3C y 4C: match con pad correcto", () => {
    const p = parseNumeros({ "3": ["661", "111"], "4": ["4661", "9999"] })
    const m = matchearAciertos(p, draw)
    expect(m.aciertos_3).toEqual([{ numero: "661", puesto: 1 }])
    expect(m.aciertos_4).toEqual([{ numero: "4661", puesto: 1 }])
    expect(m.total_aciertos).toBe(2)
  })

  it("redoblona: acierta si cabeza Y acompañante están (cualquier orden) y se rellena con ceros", () => {
    const p = parseNumeros({ "r": ["61-04", "61-99", "5-7"] })
    const m = matchearAciertos(p, draw)
    // "61-04": ambas presentes → hit; "61-99": 99 ausente → no; "5-7": rellena a 05/07 → no
    expect(m.aciertos_redoblona).toEqual([{ cabeza: "61", acompanante: "04" }])
    expect(m.total_aciertos).toBe(1)
  })

  it("redoblona rellenada sí matchea si sus formas con cero están en el sorteo", () => {
    const m = matchearAciertos(parseNumeros({ "r": ["5-7"] }), deriveNums([105, 107]))
    expect(m.aciertos_redoblona).toEqual([{ cabeza: "05", acompanante: "07" }])
  })

  it("total_aciertos suma las cuatro categorías", () => {
    const p = parseNumeros({ "2": ["61"], "3": ["804"], "4": ["8804"], "r": ["61-95"] })
    const m = matchearAciertos(p, draw)
    expect(m.total_aciertos).toBe(4)
  })
})

describe("estadoFinal", () => {
  it("quiniela delega en estadoQuiniela", () => {
    const h = hist({ resultado_oficial: [1234], numeros_2: ["34"] })
    expect(estadoFinal(h, false)).toBe("WON")
    const near = hist({ resultado_oficial: [1234], numeros_2: ["35"] })
    expect(estadoFinal(near, false)).toBe("NEAR_MISS")
  })

  it("Poceada: WON con >= 5 aciertos (alineado con la RPC count >= 5)", () => {
    expect(estadoFinal(hist({ total_aciertos: 5 }), true)).toBe("WON")
    expect(estadoFinal(hist({ total_aciertos: 9 }), true)).toBe("WON") // POCEADA_MATCHES excluía 9-10
    expect(estadoFinal(hist({ total_aciertos: 4 }), true)).toBe("LOST")
    expect(estadoFinal(hist({ total_aciertos: 0 }), true)).toBe("LOST")
  })
})

describe("posicionesDe", () => {
  it("deduplica, filtra fuera de 1..20 y ordena", () => {
    const h = hist({
      aciertos_2: [{ numero: "61", puesto: 5 }, { numero: "04", puesto: 2 }],
      aciertos_3: [{ numero: "005", puesto: 2 }],
      aciertos_4: [{ numero: "4661", puesto: 99 }],
    })
    expect(posicionesDe(h)).toEqual([2, 5])
  })
})

describe("buildHistoryInsert", () => {
  it("predicción plana: campos, verificado y game_id Nacional por defecto", () => {
    const h = buildHistoryInsert(
      { id: "p1", user_id: "u1", date: "2026-10-05", turno: "Matutina", numeros: [61, 99] },
      { numbers: [4661, 8804, 6095] },
    )
    expect(h.numeros_2).toEqual(["61", "99"])
    expect(h.resultado_oficial).toEqual([4661, 8804, 6095])
    expect(h.total_aciertos).toBe(1)
    expect(h.verified).toBe(true)
    expect(h.game_id).toBe(GAME_ID_NACIONAL)
    expect(h.prediction_id).toBe("p1")
  })

  it("predicción JSON de cifras: total suma 2C+3C+4C+redoblona", () => {
    // Forma real en BD: string JSON envuelto en array
    const raw = ['{"2":["61"],"3":["804"],"4":["8804"],"r":["61-95"]}']
    const h = buildHistoryInsert(
      { id: "p2", user_id: "u1", date: "2026-10-05", turno: "Nocturna", numeros: raw },
      { numbers: [4661, 8804, 6095] },
    )
    expect(h.total_aciertos).toBe(4)
    expect(h.redoblonas).toEqual(["61-95"])
  })

  it("game_id del sorteo manda; fallback paramétrico para Poceada", () => {
    const pred = { id: "p3", user_id: "u1", date: "2026-10-05", turno: "Poceada", numeros: [1, 2, 3, 4, 5] }
    const conGame = buildHistoryInsert(pred, { numbers: [11, 22], game_id: GAME_ID_POCEADA })
    expect(conGame.game_id).toBe(GAME_ID_POCEADA)
    const sinGame = buildHistoryInsert(pred, { numbers: [11, 22] }, GAME_ID_POCEADA)
    expect(sinGame.game_id).toBe(GAME_ID_POCEADA)
  })

  /**
   * Regresión del bug 2026-10-09: Poceada = juego SOLO de 2 cifras (00-99),
   * distinto de la Quiniela. El historial de Poceada NO debe contener
   * numeros_3/numeros_4 ni aciertos 3/4 fabricados desde el sorteo 0-99.
   */
  it("Poceada: legacy con claves 3/4 no fabrica aciertos 3/4 en el historial", () => {
    const raw = ['{"2":["07","12"],"3":["007"],"4":["0007"],"r":["07-12"]}']
    const h = buildHistoryInsert(
      { id: "p4", user_id: "u1", date: "2026-10-05", turno: "Poceada", numeros: raw },
      { numbers: [7, 12, 45, 3, 88], game_id: GAME_ID_POCEADA },
    )
    // Solo 2 cifras en todo el historial.
    expect(h.numeros_3).toEqual([])
    expect(h.numeros_4).toEqual([])
    expect(h.redoblonas).toEqual([])
    expect(h.aciertos_3).toEqual([])
    expect(h.aciertos_4).toEqual([])
    expect(h.aciertos_redoblona).toEqual([])
    // Los aciertos 2 sí se calculan (7 y 12 están en el sorteo).
    expect(h.aciertos_2).toHaveLength(2)
    expect(h.total_aciertos).toBe(2) // no inflado por 3/4/redoblona
  })

  it("deriveNums con esPoceada → nums3/nums4 vacíos (no '000'..'099')", () => {
    const d = deriveNums([7, 45, 99], true)
    expect(d.nums2).toEqual(["07", "45", "99"])
    expect(d.nums3).toEqual([])
    expect(d.nums4).toEqual([])
    // Sin esPoceada (Quiniela) sigue derivando 3/4 cifras.
    const q = deriveNums([4661, 8804], false)
    expect(q.nums3).toHaveLength(2)
    expect(q.nums4).toHaveLength(2)
  })
})

describe("feriados / días sin sorteo", () => {
  it("domingos no tienen sorteo", () => {
    expect(esDiaSinSorteo("2026-10-04", 0)).toBe(true) // domingo
    expect(esDiaSinSorteo("2026-10-05", 1)).toBe(false) // lunes normal
  })

  it("feriados argentinos 2026", () => {
    expect(esFeriado("2026-10-12")).toBe(true) // Día de la Raza
    expect(esFeriado("2026-01-01")).toBe(true)
    expect(esFeriado("2026-10-13")).toBe(false)
    expect(esDiaSinSorteo("2026-10-12", 1)).toBe(true)
  })

  it("feriados parciales: turnos suspendidos 24/12 y 31/12", () => {
    expect(esTurnoSinSorteo("2026-12-24", "Matutina")).toBe(true)
    expect(esTurnoSinSorteo("2026-12-24", "Vespertina")).toBe(true)
    expect(esTurnoSinSorteo("2026-12-24", "Nocturna")).toBe(false)
    expect(esTurnoSinSorteo("2026-12-31", "Matutina")).toBe(true)
    expect(esTurnoSinSorteo("2026-10-05", "Matutina")).toBe(false)
  })
})
