import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Verificación de Brinco: la regla central es que NUNCA se inventa un
 * resultado. Si la fuente oficial no publicó el concurso objetivo, la
 * predicción queda pendiente; si ya existe, se marcan los aciertos reales.
 *
 * El store se mockea en memoria: el módulo real depende de Supabase.
 */

interface SorteoMock {
  concurso: number
  fecha: string
  tradicional: number[]
  junior: number[] | null
}

interface PendienteMock {
  id: string
  concurso_objetivo: number
  numeros: number[]
}

const estado = vi.hoisted(() => ({
  pendientes: [] as PendienteMock[],
  sorteos: new Map<number, SorteoMock>(),
  verificadas: [] as Array<{ id: string; patch: Record<string, unknown> }>,
}))

vi.mock("@/lib/brinco/store", () => ({
  prediccionesPendientesVerificacion: vi.fn(async () => estado.pendientes),
  buscarSorteoPorConcurso: vi.fn(async (c: number) => estado.sorteos.get(c) ?? null),
  marcarVerificada: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    estado.verificadas.push({ id, patch })
  }),
}))

import { verificarPendientesBrinco } from "@/lib/brinco/verificar"

describe("brinco/verificar — verificación de predicciones", () => {
  beforeEach(() => {
    estado.pendientes = []
    estado.sorteos.clear()
    estado.verificadas = []
  })

  it("sin resultado oficial: NO inventa — la predicción queda pendiente", async () => {
    estado.pendientes = [{ id: "p1", concurso_objetivo: 1374, numeros: [1, 2, 3, 4, 5, 6] }]

    const r = await verificarPendientesBrinco()

    expect(r).toEqual({ pendientes: 1, verificadas: 0, sinResultado: 1 })
    expect(estado.verificadas).toHaveLength(0)
  })

  it("con resultado oficial: verifica con aciertos reales (Tradicional, sin Junior)", async () => {
    estado.pendientes = [{ id: "p1", concurso_objetivo: 1374, numeros: [1, 8, 13, 40, 5, 6] }]
    estado.sorteos.set(1374, {
      concurso: 1374,
      fecha: "2026-10-11",
      tradicional: [1, 8, 13, 14, 18, 24],
      junior: null,
    })

    const r = await verificarPendientesBrinco()

    expect(r).toEqual({ pendientes: 1, verificadas: 1, sinResultado: 0 })
    expect(estado.verificadas).toHaveLength(1)
    const v = estado.verificadas[0]
    expect(v.id).toBe("p1")
    expect(v.patch.aciertos_tradicional).toBe(3) // 1, 8 y 13 están en el sorteo
    expect(v.patch.aciertos_junior).toBeNull()
    expect(v.patch.estado).toBe("verificada")
    expect(v.patch.resultado_oficial).toEqual({
      tradicional: [1, 8, 13, 14, 18, 24],
      junior: null,
    })
  })

  it("cuenta los aciertos del Junior cuando el sorteo lo incluye", async () => {
    estado.pendientes = [{ id: "p1", concurso_objetivo: 1375, numeros: [1, 8, 13, 40, 5, 6] }]
    estado.sorteos.set(1375, {
      concurso: 1375,
      fecha: "2026-10-18",
      tradicional: [20, 21, 22, 23, 24, 25],
      junior: [6, 7, 8, 9, 10, 11],
    })

    const r = await verificarPendientesBrinco()

    expect(r.verificadas).toBe(1)
    const v = estado.verificadas[0]
    expect(v.patch.aciertos_tradicional).toBe(0)
    expect(v.patch.aciertos_junior).toBe(2) // 6 y 8
  })

  it("mixto: verifica las que tienen resultado y respeta las que no", async () => {
    estado.pendientes = [
      { id: "p-con-result", concurso_objetivo: 1373, numeros: [1, 2, 3, 4, 5, 6] },
      { id: "p-sin-result", concurso_objetivo: 1374, numeros: [1, 2, 3, 4, 5, 6] },
    ]
    estado.sorteos.set(1373, {
      concurso: 1373,
      fecha: "2026-09-27",
      tradicional: [5, 6, 7, 8, 9, 10],
      junior: null,
    })

    const r = await verificarPendientesBrinco()

    expect(r).toEqual({ pendientes: 2, verificadas: 1, sinResultado: 1 })
    expect(estado.verificadas).toHaveLength(1)
    expect(estado.verificadas[0].id).toBe("p-con-result")
    expect(estado.verificadas[0].patch.aciertos_tradicional).toBe(2) // 5 y 6
  })

  it("sin predicciones pendientes: no toca nada", async () => {
    const r = await verificarPendientesBrinco()
    expect(r).toEqual({ pendientes: 0, verificadas: 0, sinResultado: 0 })
    expect(estado.verificadas).toHaveLength(0)
  })
})
