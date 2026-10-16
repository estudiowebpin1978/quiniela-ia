/**
 * Capa de PDF IAFAS — NroLoteria por lotería organizadora.
 *
 * Poceada Federal se sortea bajo dos loterías miembro (" Entre Ríos",
 * " Santa Fe" según el listado oficial) y el PDF oficial sólo se LLENA con el
 * NroLoteria que organizó cada concurso; con otro número devuelve el
 * formulario en blanco de esa lotería (verificado contra los PDFs reales).
 * Estos tests cubren: el body enviado, el mapeo por nombre y el barrido de
 * loterías con validación por concurso+fecha. El caso real de rescate
 * (PDF en blanco → NroLoteria 5) queda como test LIVE gated.
 */
import { describe, expect, it } from "vitest"
import {
  descargarExtractoPdfIAFAS,
  extraerExtractoPdfIAFAS,
  nroLoteriaPreferido,
} from "@/lib/poceada-federal/fuente"

const JWT_FALSO = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ZmFrZS10b2tlbg"

interface Registrador {
  fetchImpl: typeof fetch
  cuerposPdf: { Modalidad: number; NroLoteria: number; Sorteo: number; FechaSorteo: string }[]
}

/** fetch inyectable: sirve el bundle (JWT) y captura los bodies del PDF. */
function registrador(bytesPdf: (nroLoteria: number) => Uint8Array): Registrador {
  const cuerposPdf: Registrador["cuerposPdf"] = []
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (url.includes("main.") && url.endsWith(".js")) {
      return new Response(`self.__bundle="${JWT_FALSO}";`, { status: 200 })
    }
    if (url.includes("pdfpoceada")) {
      const cuerpo = JSON.parse(String(init?.body ?? "{}")) as Registrador["cuerposPdf"][number]
      cuerposPdf.push(cuerpo)
      return new Response(bytesPdf(cuerpo.NroLoteria), { status: 200 })
    }
    return new Response("{}", { status: 200 })
  }) as typeof fetch
  return { fetchImpl, cuerposPdf }
}

const pdfFalso = () => new Uint8Array([0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41]) // ≥8 sin "%PDF-"

describe("pdfpoceada — NroLoteria por lotería organizadora", () => {
  it("descarga con el NroLoteria pedido (body oficial exacto)", async () => {
    const { fetchImpl, cuerposPdf } = registrador(() => new TextEncoder().encode("%PDF-1.4 fake"))
    const buf = await descargarExtractoPdfIAFAS(5358, "2026-03-02", { fetchImpl }, 5)
    expect(buf.subarray(0, 5).toString("latin1")).toBe("%PDF-")
    expect(cuerposPdf).toHaveLength(1)
    expect(cuerposPdf[0]).toEqual({
      Modalidad: 30,
      NroLoteria: 5,
      Sorteo: 5358,
      FechaSorteo: "2026-03-02",
    })
  })

  it("mapea la lotería del listado al NroLoteria verificado", () => {
    expect(nroLoteriaPreferido(" Santa Fe")).toBe(5)
    expect(nroLoteriaPreferido(" Santa Fe ")).toBe(5)
    expect(nroLoteriaPreferido(" Entre Ríos")).toBe(1)
    expect(nroLoteriaPreferido("entre rios")).toBe(1)
    expect(nroLoteriaPreferido("Otra Lotería")).toBeUndefined()
    expect(nroLoteriaPreferido(undefined)).toBeUndefined()
    expect(nroLoteriaPreferido("")).toBeUndefined()
  })

  it("barre las loterías miembro empezando por la preferida y nunca acepta otro sorteo", { timeout: 60000 }, async () => {
    const { fetchImpl, cuerposPdf } = registrador(pdfFalso)
    await expect(
      extraerExtractoPdfIAFAS(5358, "2026-03-02", { fetchImpl }, 5)
    ).rejects.toThrow() // ningún NroLoteria devolvió PDF legible
    expect(cuerposPdf.map((c) => c.NroLoteria)).toEqual([5, 1, 2, 3, 4, 6])
    expect(cuerposPdf.every((c) => c.Sorteo === 5358 && c.FechaSorteo === "2026-03-02")).toBe(true)
  })

  it("sin preferencia barre en orden 1..6", { timeout: 60000 }, async () => {
    const { fetchImpl, cuerposPdf } = registrador(pdfFalso)
    await expect(extraerExtractoPdfIAFAS(4294, "2024-06-01", { fetchImpl })).rejects.toThrow()
    expect(cuerposPdf.map((c) => c.NroLoteria)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

const vivo = Boolean(process.env.POCEADA_FEDERAL_LIVE)

describe.skipIf(!vivo)("pdfpoceada LIVE — rescate de PDFs en blanco (red oficial)", () => {
  it(
    "el sorteo 5358 (organizado por Santa Fe) sólo parsea con NroLoteria 5",
    { timeout: 300000 },
    async () => {
      const ext = await extraerExtractoPdfIAFAS(5358, "2026-03-02", {}, 5)
      expect(ext.concurso).toBe(5358)
      expect(ext.fecha).toBe("2026-03-02")
      expect(ext.numeros).toHaveLength(20)
      expect(new Set(ext.numeros).size).toBe(20)
    }
  )

  it(
    "el sorteo 5658 (Sep 2026, Santa Fe) también exige NroLoteria 5",
    { timeout: 300000 },
    async () => {
      const ext = await extraerExtractoPdfIAFAS(5658, "2026-09-01", {}, 5)
      expect(ext.numeros).toHaveLength(20)
    }
  )
})
