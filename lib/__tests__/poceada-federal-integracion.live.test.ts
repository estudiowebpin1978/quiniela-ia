import { describe, it, expect } from "vitest"
import {
  obtenerUltimoExtractoSF,
  listarSorteosIAFAS,
  extraerExtractoPdfIAFAS,
} from "@/lib/poceada-federal/fuente"
import { validarSorteo, FUENTES } from "@/lib/poceada-federal/validador"
import { importarHistorico } from "@/lib/poceada-federal/backfill"

/**
 * Integración en vivo contra las fuentes OFICIALES (se ejecuta sólo con:
 *
 *   POCEADA_FEDERAL_LIVE=1 npx vitest run lib/__tests__/poceada-federal-integracion.live.test.ts
 *
 * No se ejecuta en la suite normal (CI) para no depender de la red.
 * Demuestra el criterio de aceptación: extracción probada con datos
 * oficiales reales + validación de los 20 números.
 */
const LIVE = process.env.POCEADA_FEDERAL_LIVE === "1"

describe.runIf(LIVE)("integración en vivo — fuentes oficiales reales", () => {
  it("extrae y valida el último extracto HTML de Lotería de Santa Fe", async () => {
    const e = await obtenerUltimoExtractoSF()
    expect(e.mes).toMatch(/\w+ 20\d{2}/)
    expect(e.concurso).toBeGreaterThan(0)
    expect(e.numeros).toHaveLength(20)
    expect(new Set(e.numeros).size).toBe(20)
    expect(e.numeros.every((n) => n >= 0 && n <= 99)).toBe(true)
    expect(e.premios.length).toBeGreaterThanOrEqual(3)
    const r = validarSorteo({
      concurso: e.concurso,
      fecha: e.fecha,
      numeros: e.numeros,
      fuente: FUENTES.sfHtml,
      url: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarPoceadaFederal.xhtml?display=0",
    })
    expect(r.estado).toBe("validated")
  }, 60000)

  it("lista sorteos oficiales IAFAS (Poceada Federal, idJuego 30) en una ventana", async () => {
    const filas = await listarSorteosIAFAS("2026-10-01", "2026-10-15")
    expect(filas.length).toBeGreaterThanOrEqual(20)
    expect(filas.every((f) => f.idJuego === 30)).toBe(true)
    expect(filas[0].Estado).toBe("CONFIRMADO")
  }, 60000)

  it("descarga el PDF oficial de un sorteo histórico y valida sus 20 números", async () => {
    const filas = await listarSorteosIAFAS("2026-10-01", "2026-10-02")
    expect(filas.length).toBeGreaterThanOrEqual(2)
    const f = filas[0]
    const ext = await extraerExtractoPdfIAFAS(f.NROSorteo, f.Fecha2)
    expect(ext.concurso).toBe(f.NROSorteo)
    expect(ext.fecha).toBe(f.Fecha2)
    expect(ext.numeros).toHaveLength(20)
    expect(new Set(ext.numeros).size).toBe(20)
    const r = validarSorteo({
      concurso: ext.concurso,
      fecha: ext.fecha,
      hora: ext.hora,
      numeros: ext.numeros,
      fuente: FUENTES.iafasPdf,
    })
    expect(r.estado).toBe("validated")
    expect(r.contenidoHash).toMatch(/^[a-f0-9]{64}$/)
  }, 120000)

  it("backfill dry-run real: lista, descarga PDFs y valida un lote SIN escribir nada", async () => {
    const info = await importarHistorico(
      { listar: listarSorteosIAFAS, pdf: extraerExtractoPdfIAFAS },
      { desde: "2026-10-01", hasta: "2026-10-03", modo: "dry-run", limite: 6 }
    )
    console.log(
      "[live-backfill]",
      JSON.stringify({
        modo: info.modo,
        encontrados: info.encontrados,
        procesados: info.procesados,
        importados: info.importados,
        fallidos: info.fallidos,
        primerSorteo: info.primerSorteo,
        ultimoSorteo: info.ultimoSorteo,
        brechas: info.brechasDias.length,
      })
    )
    expect(info.modo).toBe("dry-run")
    expect(info.encontrados).toBeGreaterThanOrEqual(4)
    expect(info.procesados).toBeGreaterThan(0)
    expect(info.fallidos).toBe(0)
    expect(info.importados).toBe(info.procesados)
  }, 180000)
})
