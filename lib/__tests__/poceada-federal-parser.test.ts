import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { join } from "path"
import {
  parsearExtractoHtml,
  extraerNumerosHtml,
  extraerPremiosHtml,
  parsearTextoPdfPoceada,
  parsearEtiquetaSorteo,
  parsearMes,
  fechaDesdeEtiqueta,
  mismosNumeros,
  ErrorParseo,
} from "@/lib/poceada-federal/parser"
import {
  validarSorteo,
  esFuenteOficial,
  hashContenido,
  FUENTES,
} from "@/lib/poceada-federal/validador"
import type { SorteoPoceadaFederal } from "@/lib/poceada-federal/tipos"

const fx = (n: string) =>
  readFileSync(join(process.cwd(), "lib/__tests__/fixtures/poceada-federal", n), "utf8")

describe("parser HTML — extracto oficial real de Lotería de Santa Fe", () => {
  it("parsea el último extracto capturado (atribución por primera opción cuando no hay selected)", () => {
    const e = parsearExtractoHtml(fx("ultimo.html"))
    expect(e.mes).toBe("Octubre 2026")
    expect(e.etiquetaSorteo).toBe("Miércoles 14 - 5732")
    expect(e.concurso).toBe(5732)
    expect(e.fecha).toBe("2026-10-14")
    expect(e.diaSemana).toBe("miercoles")
    expect(e.numeros).toHaveLength(20)
    expect(new Set(e.numeros).size).toBe(20)
    expect(e.numeros.slice(0, 4)).toEqual([0, 5, 6, 11])
    expect(e.numeros).toContain(78)
    expect(e.numeros).toContain(91)
    expect(e.numeros.every((n) => n >= 0 && n <= 99)).toBe(true)
    expect(e.premios).toHaveLength(3)
    expect(e.premios[0]).toEqual({
      nivel: "1° Premio",
      ganadores: "VACANTE",
      importe: "278.123.478,75",
    })
    expect(e.premios[2].nivel).toBe("3° Premio")
    expect(e.pdfUuid).toMatch(/^[A-F0-9-]{8,}$/)
    expect(e.viewState).toBeTruthy()
    expect(e.action).toContain("mostrarPoceadaFederal.xhtml")
  })

  it("respeta la atribución por selected=\"selected\" en la navegación a un sorteo", () => {
    const e = parsearExtractoHtml(fx("octubre_5711.html"))
    expect(e.etiquetaSorteo).toBe("Jueves 1 - 5711")
    expect(e.concurso).toBe(5711)
    expect(e.fecha).toBe("2026-10-01")
    expect(e.diaSemana).toBe("jueves")
    expect(e.numeros).toHaveLength(20)
    expect(e.numeros.slice(0, 4)).toEqual([14, 25, 28, 29])
    expect(e.numeros).toContain(96)
    expect(e.numeros).toContain(99)
    expect(e.premios[0]).toEqual({
      nivel: "1° Premio",
      ganadores: "VACANTE",
      importe: "263.221.042,50",
    })
    expect(e.pdfUuid).toMatch(/^2760C403-/)
  })

  it("RECHAZA una captura contaminada: mes de septiembre con rótulo de sorteo incoherente", () => {
    // septiembre_5681.html es una captura real defectuosa (mes=Septiembre pero
    // la lista corresponde a octubre): la validación de día-de-semana la rechaza.
    expect(() => parsearExtractoHtml(fx("septiembre_5681.html"))).toThrow(ErrorParseo)
    expect(() => parsearExtractoHtml(fx("septiembre_5681.html"))).toThrow(
      /Día de semana inconsistente/
    )
  })

  it("rechaza HTML que no es el extracto", () => {
    expect(() => parsearExtractoHtml("<html><body>hola</body></html>")).toThrow(
      /No parece el extracto/
    )
  })

  it("rechaza extractos con menos de 20 números", () => {
    const html = fx("ultimo.html").replace(/<div class="col-xs-2 cuadradoPo"><b>\d{2}<\/b><\/div>/, "")
    expect(() => extraerNumerosHtml(html)).toThrow(/19 números/)
  })

  it("rechaza números repetidos", () => {
    const html = fx("ultimo.html").replace('cuadradoPo"><b>05</b>', 'cuadradoPo"><b>00</b>')
    expect(() => extraerNumerosHtml(html)).toThrow(/repetidos/)
  })

  it("extrae la tabla de premios oficial", () => {
    const premios = extraerPremiosHtml(fx("octubre_5711.html"))
    expect(premios).toHaveLength(3)
    expect(premios[1].nivel).toBe("2° Premio")
    expect(premios.map((p) => p.ganadores)).toEqual(["VACANTE", "VACANTE", "4"])
  })
})

describe("parser PDF — extracto oficial IAFAS real (pdfpoceada)", () => {
  const texto = fx("extracto_5710.txt")

  it("extrae cabecera y los 20 números del PDF real del concurso 5710", () => {
    const e = parsearTextoPdfPoceada(texto)
    expect(e.concurso).toBe(5710)
    expect(e.fecha).toBe("2026-10-01")
    expect(e.hora).toBe("15:00")
    expect(e.numeros).toEqual([
      1, 7, 10, 11, 14, 29, 33, 41, 44, 48, 51, 60, 67, 68, 70, 74, 87, 88, 91, 98,
    ])
    expect(new Set(e.numeros).size).toBe(20)
  })

  it("rechaza un PDF sin cabecera de sorteo", () => {
    expect(() => parsearTextoPdfPoceada("solo texto libre sin datos")).toThrow(
      /sin cabecera dd\/mm\/yyyy/
    )
  })

  it("rechaza un PDF con números incompletos", () => {
    const truncado = texto.replace(/\n74 87 88 91 98/, "")
    expect(() => parsearTextoPdfPoceada(truncado)).toThrow(/15 números/)
  })
})

describe("etiquetas, meses y fechas", () => {
  it("parsea etiquetas de sorteo", () => {
    expect(parsearEtiquetaSorteo("Miércoles 14 - 5733")).toEqual({
      diaSemana: "miercoles",
      diaMes: 14,
      concurso: 5733,
    })
    expect(() => parsearEtiquetaSorteo("Chorizo - 1")).toThrow(/Etiqueta de sorteo inválida/)
  })

  it("parsea el mes seleccionado", () => {
    expect(parsearMes("Octubre 2026")).toEqual({ mes: 10, anio: 2026 })
    expect(() => parsearMes("Octubre")).toThrow(/Mes inválido/)
    expect(() => parsearMes("Fome 2026")).toThrow(/desconocido/)
  })

  it("valida la fecha contra el día de la semana", () => {
    const f = fechaDesdeEtiqueta("Jueves 1 - 5711", "Octubre 2026")
    expect(f.fecha).toBe("2026-10-01")
    expect(f.concurso).toBe(5711)
    // 14/10/2026 es miércoles: un rótulo de lunes debe rechazarse
    expect(() => fechaDesdeEtiqueta("Lunes 14 - 5733", "Octubre 2026")).toThrow(
      /Día de semana inconsistente/
    )
  })

  it("compara conjuntos de números independientemente del orden", () => {
    expect(mismosNumeros([1, 2, 3], [3, 2, 1])).toBe(true)
    expect(mismosNumeros([1, 2, 3], [1, 2, 4])).toBe(false)
    expect(mismosNumeros([1, 2], [1, 2, 3])).toBe(false)
  })
})

// ─── Validador ───────────────────────────────────────────────────────────────

const NUMS = [1, 7, 10, 11, 14, 29, 33, 41, 44, 48, 51, 60, 67, 68, 70, 74, 87, 88, 91, 98]

function sorteoFake(over: Partial<SorteoPoceadaFederal> = {}): SorteoPoceadaFederal {
  return {
    concurso: 5710,
    fecha: "2026-10-01",
    numeros: NUMS,
    fuente: FUENTES.iafasPdf,
    fuentes: [FUENTES.iafasPdf],
    corroborado: false,
    estado: "validated",
    contenidoHash: hashContenido(5710, "2026-10-01", NUMS),
    consultadoEn: "2026-10-15T00:00:00.000Z",
    ...over,
  }
}

describe("validador — reglas de auditoría", () => {
  const base = {
    concurso: 5710,
    fecha: "2026-10-01",
    numeros: NUMS,
    fuente: FUENTES.iafasPdf,
  }

  it("acepta un extracto oficial completo y calcula el hash", () => {
    const r = validarSorteo(base)
    expect(r.estado).toBe("validated")
    expect(r.corroborado).toBe(false)
    expect(r.contenidoHash).toMatch(/^[a-f0-9]{64}$/)
    expect(r.incidentes).toHaveLength(0)
  })

  it("marca corroborado cuando una segunda fuente oficial coincide (aunque cambie el orden)", () => {
    const r = validarSorteo(base, { segundaFuente: [...NUMS].reverse() })
    expect(r.estado).toBe("validated")
    expect(r.corroborado).toBe(true)
  })

  it("marca conflicto cuando las dos fuentes oficiales no coinciden", () => {
    const r = validarSorteo(base, { segundaFuente: [0, 2, 3, 4, 5, 6, 8, 9, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24] })
    expect(r.estado).toBe("conflict")
    expect(r.incidentes.some((i) => i.tipo === "conflicto_entre_fuentes")).toBe(true)
  })

  it.each([
    ["19 números", { ...base, numeros: NUMS.slice(0, 19) }, /19 números/],
    ["21 números", { ...base, numeros: [...NUMS, 99] }, /21 números/],
    [
      "número repetido",
      { ...base, numeros: [0, 0, ...NUMS.slice(2)] },
      /Números repetidos/,
    ],
    ["fuera de rango", { ...base, numeros: [100, ...NUMS.slice(1)] }, /fuera del rango/],
    ["fecha imposible", { ...base, fecha: "2026-13-01" }, /Fecha inválida/],
    ["fecha formato erróneo", { ...base, fecha: "01/10/2026" }, /Fecha inválida/],
    ["concurso cero", { ...base, concurso: 0 }, /Concurso inválido/],
    ["sin números", { ...base, numeros: undefined }, /Faltan los 20 números/],
    ["sin fecha", { ...base, fecha: "" }, /Falta la fecha/],
  ])("rechaza: %s", (_nombre, cand, esperado) => {
    const r = validarSorteo(cand as typeof base)
    expect(r.estado).toBe("failed")
    expect(r.detalle).toMatch(esperado)
    expect(r.incidentes.length).toBeGreaterThan(0)
  })

  it("rechaza fuentes que no son de los portales oficiales", () => {
    expect(esFuenteOficial("https://apps.loteriasantafe.gov.ar:8443/Extractos/x")).toBe(true)
    expect(esFuenteOficial("https://servicios.iafas.gov.ar/x")).toBe(true)
    expect(esFuenteOficial("https://tujugada.example.com/x")).toBe(false)
    expect(esFuenteOficial("https://apps.loteriasantafe.gov.ar.evil.com/x")).toBe(false)
    const r = validarSorteo({ ...base, url: "https://tujugada.example.com/x" })
    expect(r.estado).toBe("failed")
    expect(r.detalle).toMatch(/fuente no oficial/)
  })

  it("detecta contradicción con un registro previo del mismo concurso", () => {
    const previo = sorteoFake()
    const existentes = new Map([[5710, previo]])
    const r = validarSorteo(
      { ...base, numeros: [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80] },
      { existentes }
    )
    expect(r.estado).toBe("conflict")
    expect(r.incidentes[0].tipo).toBe("contradiccion")
    expect(r.incidentes[0].detalle).toHaveProperty("previoHash")
  })

  it("no contradice: mismo concurso con el mismo extracto se considera consistente", () => {
    const existentes = new Map([[5710, sorteoFake()]])
    const r = validarSorteo(base, { existentes })
    expect(r.incidentes).toHaveLength(0)
    expect(r.estado).toBe("validated")
    expect(r.detalle).toMatch(/Consistente/)
  })

  it("la ausencia de premios no invalida un sorteo", () => {
    const r = validarSorteo(base)
    expect(r.estado).toBe("validated")
  })

  it("hash estable ante reordenamiento de números", () => {
    expect(hashContenido(1, "2026-01-01", [1, 2, 3])).toBe(
      hashContenido(1, "2026-01-01", [3, 2, 1])
    )
    expect(hashContenido(1, "2026-01-01", [1, 2, 3])).not.toBe(
      hashContenido(1, "2026-01-02", [1, 2, 3])
    )
  })
})
