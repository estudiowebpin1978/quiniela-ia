import { describe, it, expect, vi } from "vitest"
import { importarHistorico } from "@/lib/poceada-federal/backfill"
import { sincronizar } from "@/lib/poceada-federal/actualizar"
import { FUENTES } from "@/lib/poceada-federal/validador"
import { ErrorParseo } from "@/lib/poceada-federal/parser"
import type { FilaSorteoIAFAS } from "@/lib/poceada-federal/tipos"

// ─── Backfill (importación histórica reanudable) ────────────────────────────

const fila = (n: number, fecha: string): FilaSorteoIAFAS => ({
  ID: 1000 + n,
  NROSorteo: n,
  Fecha2: fecha,
  Fecha: fecha.split("-").reverse().join("/"),
  Juego: "Poceada Federal",
  idJuego: 30,
  Hora: "15:00",
  Estado: "CONFIRMADO",
})

function depsBase(over: Record<string, unknown> = {}) {
  return {
    listar: vi.fn(async () => [
      fila(5710, "2026-10-01"),
      fila(5711, "2026-10-01"),
      fila(5733, "2026-10-14"),
      fila(5700, "2026-09-25"), // fecha de brecha >4 días respecto de 5710
      { ...fila(5799, "2026-10-15"), Estado: "PENDIENTE" },
    ]),
    pdf: vi.fn(async (c: number, f: string) => ({
      concurso: c,
      fecha: f,
      hora: "15:00",
      numeros: [1, 7, 10, 11, 14, 29, 33, 41, 44, 48, 51, 60, 67, 68, 70, 74, 87, 88, 91, 98],
    })),
    ...over,
  }
}

const repoVacio = () => ({
  concursos: vi.fn(async () => new Set<number>()),
  insertar: vi.fn(async () => 1),
  incidente: vi.fn(async () => {}),
})

describe("backfill histórico — reanudable, por lotes, sin romper nada", () => {
  it("dry-run: procesa y valida sin escribir nada", async () => {
    const deps = depsBase()
    const repo = repoVacio()
    const info = await importarHistorico(deps, {
      desde: "2026-09-01",
      hasta: "2026-10-15",
      modo: "dry-run",
    })
    expect(info.modo).toBe("dry-run")
    expect(info.encontrados).toBe(4) // el PENDIENTE no cuenta
    expect(info.procesados).toBe(4)
    expect(info.importados).toBe(4)
    expect(info.fallidos).toBe(0)
    expect(info.reanudable).toBe(true)
    expect(repo.insertar).not.toHaveBeenCalled() // repo no se pasó → sin escrituras
    expect(info.detalle).toMatch(/no estaban CONFIRMADO/)
    expect(info.primerSorteo).toBe("2026-09-25")
    expect(info.ultimoSorteo).toBe("2026-10-14")
    expect(deps.pdf).toHaveBeenCalledTimes(4)
    void repo
  })

  it("respetan el límite de lote y omite concursos ya existentes", async () => {
    const repo = repoVacio()
    repo.concursos.mockResolvedValue(new Set([5710, 5711]))
    const deps = depsBase()
    const info = await importarHistorico({ ...deps, repo }, {
      desde: "2026-09-01",
      hasta: "2026-10-15",
      limite: 1,
      modo: "importar",
    })
    expect(info.procesados).toBe(1) // sólo 1 pendiente por límite=1
    expect(repo.insertar).toHaveBeenCalledTimes(1)
    expect(info.omitidosDuplicados).toBe(1) // el otro pendiente queda para el próximo lote
    // el registro insertado conserva fuente, hash y estado validated
    const fila = repo.insertar.mock.calls[0][0][0] as Record<string, unknown>
    expect(fila.concurso).toBe(5700) // el pendiente más viejo primero (orden cronológico)
    expect(fila.fuente).toBe(FUENTES.iafasPdf)
    expect(fila.estado).toBe("validated")
    expect(String(fila.contenido_hash)).toMatch(/^[a-f0-9]{64}$/)
  })

  it("un PDF ilegible queda como fallido con causa e incidente, nunca validado", async () => {
    const repo = repoVacio()
    const deps = depsBase({
      pdf: vi.fn(async (c: number, f: string) => {
        if (c === 5711) throw new ErrorParseo("PDF con 15 números (se esperaban 20)")
        return {
          concurso: c,
          fecha: f,
          hora: "15:00",
          numeros: [1, 7, 10, 11, 14, 29, 33, 41, 44, 48, 51, 60, 67, 68, 70, 74, 87, 88, 91, 98],
        }
      }),
    })
    const info = await importarHistorico(
      { ...deps, repo },
      { desde: "2026-10-01", hasta: "2026-10-15", modo: "importar" }
    )
    expect(info.ok).toBe(false)
    expect(info.fallidos).toBe(1)
    expect(info.fallidosDetalle[0]).toEqual({
      concurso: 5711,
      causa: "PDF ilegible/incompleto: PDF con 15 números (se esperaban 20)",
    })
    expect(repo.incidente).toHaveBeenCalledWith(5711, "backfill_fallido", expect.any(Object))
    expect(info.importados).toBe(3)
    // reanudar: los ya insertados/pendientes se recalculan en la siguiente corrida
    expect(info.reanudable).toBe(true)
  })

  it("detecta brechas reales del listado oficial", async () => {
    const deps = depsBase()
    const info = await importarHistorico(deps, { desde: "2026-09-01", hasta: "2026-10-15", modo: "dry-run" })
    expect(info.brechasDias.length).toBeGreaterThanOrEqual(1)
    const b = info.brechasDias.find((x) => x.desde === "2026-09-25" && x.hasta === "2026-10-01")
    expect(b?.dias).toBe(6)
  })
})

// ─── Sincronización incremental (cron) ──────────────────────────────────────

function repoSinc(over: Record<string, unknown> = {}) {
  return {
    insertar: vi.fn(async (f: unknown[]) => f.length),
    mapa: vi.fn(async () => new Map()),
    corroborar: vi.fn(async () => true),
    incidente: vi.fn(async () => {}),
    refrescarConsultas: vi.fn(async (c: number[]) => c.length),
    ultimoValidado: vi.fn(async () => null),
    ...over,
  }
}

const NUMS_A = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]

describe("sincronización — atribución y corroboración entre fuentes oficiales", () => {
  it("importa el sorteo IAFAS y lo corrobora con Santa Fe (igualdad de conjuntos)", async () => {
    const repo = repoSinc()
    const informe = await sincronizar({
      repo,
      iafas: async () => [
        { concurso: 5733, fecha: "2026-10-14", hora: "21:00", numeros: NUMS_A },
      ],
      sf: async () => ({
        mes: "Octubre 2026",
        etiquetaSorteo: "Miércoles 14 - 5732", // rótulo no coincide → igualdad de conjuntos
        concurso: 5732,
        diaMes: 14,
        diaSemana: "miercoles",
        fecha: "2026-10-14",
        numeros: NUMS_A, // mismos 20 números
        premios: [],
        pdfUuid: "ABC",
      }),
      ahora: () => new Date("2026-10-15T12:00:00.000Z"),
    })
    expect(informe.ok).toBe(true)
    expect(informe.importados).toBe(1)
    expect(informe.corroborados).toBe(1)
    expect(informe.fuenteUsada).toBe("iafas+loteriasantafe")
    const fila = repo.insertar.mock.calls[0][0][0] as Record<string, unknown>
    expect(fila.concurso).toBe(5733)
    expect(fila.corroborado).toBe(true)
    expect(fila.fuentes).toEqual(
      expect.arrayContaining([FUENTES.iafasInstantaneo, FUENTES.sfHtml])
    )
    expect(fila.contenido_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(repo.incidente).not.toHaveBeenCalled()
    expect(repo.refrescarConsultas).not.toHaveBeenCalled() // fila nueva, no duplicada
  })

  it("es idempotente: el segundo pase omite el duplicado sin reinsertar", async () => {
    const previo = {
      concurso: 5733,
      contenidoHash: (await import("@/lib/poceada-federal/validador")).hashContenido(
        5733,
        "2026-10-14",
        NUMS_A
      ),
      estado: "validated",
      corroborado: true,
    }
    const repo = repoSinc({
      mapa: vi.fn(async () => new Map([[5733, previo]])),
    })
    const informe = await sincronizar({
      repo,
      iafas: async () => [{ concurso: 5733, fecha: "2026-10-14", hora: "21:00", numeros: NUMS_A }],
      sf: async () => {
        throw new Error("Santa Fe no responde")
      },
      ahora: () => new Date("2026-10-15T12:00:00.000Z"),
    })
    expect(informe.importados).toBe(0)
    expect(informe.omitidosDuplicados).toBe(1)
    expect(repo.insertar).not.toHaveBeenCalled()
    // el duplicado se reconsultó en la fuente → /estado ve la consulta fresca
    expect(repo.refrescarConsultas).toHaveBeenCalledWith([5733], "2026-10-15T12:00:00.000Z")
    expect(informe.ok).toBe(false) // Santa Fe falló → se dice explícitamente
    expect(informe.detalle).toMatch(/Santa Fe/)
    expect(informe.fuenteUsada).toBe("iafas")
  })

  it("detecta contradicción con el registro previo (conflict + incidente)", async () => {
    const previo = {
      concurso: 5733,
      contenidoHash: "hash-distinto-previo",
      estado: "validated",
      corroborado: false,
    }
    const repo = repoSinc({ mapa: vi.fn(async () => new Map([[5733, previo]])) })
    const informe = await sincronizar({
      repo,
      iafas: async () => [{ concurso: 5733, fecha: "2026-10-14", hora: "21:00", numeros: NUMS_A }],
      sf: async () => {
        throw new Error("sin html")
      },
      ahora: () => new Date("2026-10-15T12:00:00.000Z"),
    })
    expect(informe.conflictos).toBe(1)
    expect(repo.incidente).toHaveBeenCalledWith(5733, "contradiccion", expect.any(Object))
    expect(repo.insertar).not.toHaveBeenCalled()
  })

  it("si Santa Fe no coincide con IAFAS se registra incidente y NO se adivina", async () => {
    const repo = repoSinc()
    const otros = [99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80]
    const informe = await sincronizar({
      repo,
      iafas: async () => [{ concurso: 5733, fecha: "2026-10-14", hora: "21:00", numeros: NUMS_A }],
      sf: async () => ({
        mes: "Octubre 2026",
        etiquetaSorteo: "Miércoles 14 - 5734",
        concurso: 5734,
        diaMes: 14,
        diaSemana: "miercoles",
        fecha: "2026-10-14",
        numeros: otros,
        premios: [],
      }),
      ahora: () => new Date("2026-10-15T12:00:00.000Z"),
    })
    expect(repo.incidente).toHaveBeenCalledWith(
      5734,
      "sf_sin_correspondencia",
      expect.any(Object)
    )
    expect(informe.importados).toBe(1) // sólo el de IAFAS
    const fila = repo.insertar.mock.calls[0][0][0] as Record<string, unknown>
    expect(fila.corroborado).toBe(false) // sin corroboración falsa
  })

  it("si fallan ambas fuentes lo dice, sin importar nada", async () => {
    const repo = repoSinc()
    const informe = await sincronizar({
      repo,
      iafas: async () => {
        throw new Error("IAFAS caído")
      },
      sf: async () => {
        throw new Error("Santa Fe caído")
      },
      ahora: () => new Date("2026-10-15T12:00:00.000Z"),
    })
    expect(informe.ok).toBe(false)
    expect(informe.fuenteUsada).toBe("ninguna")
    expect(informe.importados).toBe(0)
    expect(repo.insertar).not.toHaveBeenCalled()
    expect(informe.detalle).toMatch(/IAFAS caído/)
    expect(informe.detalle).toMatch(/Santa Fe caído/)
  })
})
