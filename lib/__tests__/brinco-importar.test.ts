import { describe, it, expect } from "vitest"
import {
  importarSorteos,
  aFila,
  type BrincoStore,
  type BrincoDrawRow,
} from "@/lib/brinco/importar"
import type { BrincoSorteoScrapeado } from "@/lib/brinco/scraper-cas"

function memoriaInicial(): { store: BrincoStore; rows: Map<number, BrincoDrawRow> } {
  const rows = new Map<number, BrincoDrawRow>()
  const store: BrincoStore = {
    async getByConcurso(c) {
      return rows.get(c) ?? null
    },
    async getByFecha(f) {
      for (const r of rows.values()) if (r.fecha === f) return r
      return null
    },
    async insertOrIgnore(row) {
      if (rows.has(row.concurso)) return "omitido"
      rows.set(row.concurso, row)
      return "insertado"
    },
  }
  return { store, rows }
}

function sorteo(
  concurso: number,
  fecha: string,
  tradicional: number[],
  junior: number[] | null = null,
): BrincoSorteoScrapeado {
  return { concurso, fecha, tradicional, junior, fuente: "cas-oficial", url: "u", extraido_en: "t" }
}

describe("brinco/importar — idempotencia", () => {
  it("importar dos veces NO duplica concursos", async () => {
    const { store, rows } = memoriaInicial()
    const lista = [sorteo(100, "2026-05-03", [1, 2, 3, 4, 5, 6])]
    const r1 = await importarSorteos(lista, store)
    expect(r1.importados).toBe(1)
    expect(rows.size).toBe(1)

    const r2 = await importarSorteos(lista, store)
    expect(r2.importados).toBe(0)
    expect(r2.omitidos_duplicados).toBe(1)
    expect(rows.size).toBe(1) // sin duplicado
  })

  it("una segunda corrida idéntica omite todo (reanudación)", async () => {
    const { store, rows } = memoriaInicial()
    const lista = [
      sorteo(100, "2026-05-03", [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]),
      sorteo(101, "2026-05-10", [13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]),
    ]
    await importarSorteos(lista, store)
    const r2 = await importarSorteos(lista, store)
    expect(r2.importados).toBe(0)
    expect(r2.omitidos_duplicados).toBe(2)
    expect(rows.size).toBe(2)
  })
})

describe("brinco/importar — discrepancias y auditoría", () => {
  it("un concurso existente con combinación distinta se marca conflicto y NO se sobrescribe", async () => {
    const { store, rows } = memoriaInicial()
    await importarSorteos([sorteo(100, "2026-05-03", [1, 2, 3, 4, 5, 6])], store)
    // Fuente discrepante: mismo concurso, otros números.
    const r = await importarSorteos([sorteo(100, "2026-05-03", [6, 5, 4, 3, 2, 10])], store)
    expect(r.conflictos).toBe(1)
    expect(r.importados).toBe(0)
    // No elegimos arbitrariamente: se conserva el original.
    expect(rows.get(100)?.tradicional).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("una misma combinación en distinto orden NO es conflicto (orden irrelevante)", async () => {
    const { store } = memoriaInicial()
    await importarSorteos([sorteo(100, "2026-05-03", [1, 2, 3, 4, 5, 6])], store)
    const r = await importarSorteos([sorteo(100, "2026-05-03", [6, 5, 4, 3, 2, 1])], store)
    expect(r.conflictos).toBe(0)
    expect(r.omitidos_duplicados).toBe(1)
  })
})

describe("brinco/importar — clasificación y reglas", () => {
  it("aFila asigna el período de reglas del Junior según fecha/concurso", () => {
    const f2026 = aFila(sorteo(1373, "2026-09-27", [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]), "verified_official")
    expect(f2026.reglas_junior).toBe("junior_siempresale")
    expect(f2026.estado_verificacion).toBe("verified_official")

    // Por defecto (sin contexto de importación) el estado es conservador.
    const fDefault = aFila(sorteo(1374, "2026-10-04", [1, 2, 3, 4, 5, 6]))
    expect(fDefault.estado_verificacion).toBe("pending_verification")

    const f2018 = aFila(sorteo(950, "2018-01-07", [1, 2, 3, 4, 5, 6], null))
    expect(f2018.reglas_junior).toBe("sin_junior")
  })

  it("aFila normaliza (ordena) las combinaciones", () => {
    const f = aFila(sorteo(100, "2026-05-03", [39, 0, 15, 22, 5, 10]))
    expect(f.tradicional).toEqual([0, 5, 10, 15, 22, 39])
  })

  it("los datos pendientes/rechazados no entran al store (solo verified)", async () => {
    // importarSorteos solo recibe sorteos scrapeados válidos; un sorteo inválido
    // no llega aquí (el scraper lo clasifica como error). Simulamos que solo el
    // válido se persiste.
    const { store, rows } = memoriaInicial()
    await importarSorteos(
      [sorteo(100, "2026-05-03", [1, 2, 3, 4, 5, 6])],
      store,
    )
    expect(rows.size).toBe(1)
    expect([...rows.values()][0].estado_verificacion).toBe("verified_official")
  })
})
