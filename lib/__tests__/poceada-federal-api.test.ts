import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { mulberry32 } from "@/lib/poceada-federal/backtest"
import type { SorteoValidado } from "@/lib/poceada-federal/estadisticas"

vi.mock("@/lib/poceada-federal/repositorio", () => {
  class ErrorMigracionPendiente extends Error {}
  return {
    ErrorMigracionPendiente,
    insertarSorteos: vi.fn(async () => 1),
    mapaExistentes: vi.fn(async () => new Map()),
    agregarCorroboracion: vi.fn(async () => true),
    registrarIncidente: vi.fn(async () => {}),
    ultimoValidado: vi.fn(async () => null),
    concursosExistentes: vi.fn(async () => new Set<number>()),
    listarSorteos: vi.fn(async () => []),
    historialValidado: vi.fn(async () => []),
    conteoEstados: vi.fn(async () => ({ pending: 0, validated: 0, conflict: 0, failed: 0 })),
    guardarPrediccion: vi.fn(async () => "pred-1"),
    listarPredicciones: vi.fn(async () => []),
    marcarEvaluacion: vi.fn(async () => {}),
    marcarNoEvaluable: vi.fn(async () => {}),
    idDrawPorConcurso: vi.fn(async () => "draw-1"),
  }
})

vi.mock("@/lib/poceada-federal/actualizar", () => ({
  sincronizar: vi.fn(async () => ({
    ok: true,
    intentoEn: "2026-10-15T12:00:00.000Z",
    fuenteUsada: "iafas+loteriasantafe",
    importados: 1,
    corroborados: 1,
    omitidosDuplicados: 0,
    conflictos: 0,
    errores: 0,
  })),
}))

vi.mock("@/lib/poceada-federal/fuente", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/poceada-federal/fuente")>()
  return {
    ...real, // conserva helpers puros (nroLoteriaPreferido, parser, etc.)
    listarSorteosIAFAS: vi.fn(async () => []),
    extraerExtractoPdfIAFAS: vi.fn(async () => {
      throw new Error("sin red en tests")
    }),
  }
})

vi.mock("@/lib/auth/tier", () => ({
  resolveUserTier: vi.fn(async () => ({ canAccessPremiumFeatures: false })),
}))

import { GET as cronGET } from "@/app/api/cron-poceada-federal/route"
import { GET as drawsGET } from "@/app/api/poceada-federal/draws/route"
import { GET as estadoGET } from "@/app/api/poceada-federal/estado/route"
import { GET as combGET, POST as combPOST } from "@/app/api/poceada-federal/combinaciones/route"
import {
  ErrorMigracionPendiente,
  listarSorteos,
  historialValidado,
  conteoEstados,
  listarPredicciones,
  insertarSorteos,
  guardarPrediccion,
  marcarEvaluacion,
} from "@/lib/poceada-federal/repositorio"
import { sincronizar } from "@/lib/poceada-federal/actualizar"
import { listarSorteosIAFAS } from "@/lib/poceada-federal/fuente"
import { resolveUserTier } from "@/lib/auth/tier"

const req = (url: string, headers: Record<string, string> = {}) =>
  new NextRequest("http://localhost" + url, { headers })

/** Historial sintético para el flujo premium completo. */
function historial(n: number): SorteoValidado[] {
  const rnd = mulberry32(7)
  const out: SorteoValidado[] = []
  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: 100 }, (_, k) => k)
    for (let j = 0; j < 20; j++) {
      const p = j + Math.floor(rnd() * (100 - j))
      ;[pool[j], pool[p]] = [pool[p], pool[j]]
    }
    out.push({
      concurso: 5000 + i,
      fecha: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      numeros: pool.slice(0, 20).sort((a, b) => a - b),
    })
  }
  return out
}

let secretoPrevio: string | undefined

beforeAll(() => {
  secretoPrevio = process.env.CRON_SECRET
  process.env.CRON_SECRET = "secreto-cron-prueba"
})

afterAll(() => {
  if (secretoPrevio === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = secretoPrevio
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe("GET /api/cron-poceada-federal — seguridad del cron", () => {
  it("rechaza sin credenciales (401)", async () => {
    const r = await cronGET(req("/api/cron-poceada-federal"))
    expect(r.status).toBe(401)
    expect(await r.json()).toEqual({ error: "Unauthorized" })
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it("rechaza con secreto incorrecto (401)", async () => {
    const r = await cronGET(
      req("/api/cron-poceada-federal", { authorization: "Bearer otro-secreto" })
    )
    expect(r.status).toBe(401)
    expect(sincronizar).not.toHaveBeenCalled()
  })

  it("acepta CRON_SECRET correcto y devuelve el informe", async () => {
    const r = await cronGET(
      req("/api/cron-poceada-federal", { authorization: "Bearer secreto-cron-prueba" })
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.informe.importados).toBe(1)
    expect(body.backfill).toBeNull()
    expect(sincronizar).toHaveBeenCalledTimes(1)
  })
})

describe("GET /api/poceada-federal/draws — lectura pública paginada", () => {
  it("valida y pagina sin exponer nada privado", async () => {
    vi.mocked(listarSorteos).mockResolvedValueOnce([
      {
        concurso: 5733,
        fecha: "2026-10-14",
        hora: "21:00",
        numeros: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
        fuente: "iafas-servicioextracto-ultimo",
        fuentes: ["iafas-servicioextracto-ultimo", "loteriasantafe-extractos-html"],
        corroborado: true,
        estado: "validated",
        contenidoHash: "x".repeat(64),
        consultadoEn: "2026-10-15T12:00:00.000Z",
      },
    ])
    const r = await drawsGET(req("/api/poceada-federal/draws?limit=99999&offset=0"))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.cantidad).toBe(1)
    expect(body.sorteos[0].concurso).toBe(5733)
    expect(body.limit).toBe(500) // tope de seguridad
    expect(body.siguienteOffset).toBeNull() // 1 < 500 → no hay página siguiente
    expect(listarSorteos).toHaveBeenCalledWith(
      expect.objectContaining({ limite: 500, offset: 0, soloValidados: true })
    )
    const crudo = JSON.stringify(body)
    expect(crudo).not.toMatch(/service_role|SUPABASE|Bearer/i)
  })

  it("responde 503 con diagnóstico si la migración no está aplicada", async () => {
    vi.mocked(listarSorteos).mockRejectedValueOnce(
      new ErrorMigracionPendiente("La migración 20261015060000_poceada_federal_module.sql no está aplicada")
    )
    const r = await drawsGET(req("/api/poceada-federal/draws"))
    expect(r.status).toBe(503)
    const body = await r.json()
    expect(body.error).toBe("migracion_pendiente")
    expect(body.detalle).toMatch(/20261015060000/)
  })
})

describe("GET /api/poceada-federal/estado — cobertura declarada", () => {
  it("devuelve conteos, cobertura y brechas del historial validado", async () => {
    vi.mocked(conteoEstados).mockResolvedValueOnce({
      pending: 0,
      validated: 3,
      conflict: 1,
      failed: 0,
    })
    vi.mocked(historialValidado).mockResolvedValueOnce([
      { concurso: 1, fecha: "2026-10-01" } as SorteoValidado,
      { concurso: 2, fecha: "2026-10-08" } as SorteoValidado, // brecha de 7 días
      { concurso: 3, fecha: "2026-10-14" } as SorteoValidado,
    ])
    const r = await estadoGET(req("/api/poceada-federal/estado"))
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.conteoPorEstado.validated).toBe(3)
    expect(body.cobertura.cantidadValidados).toBe(3)
    expect(body.cobertura.primeraFecha).toBe("2026-10-01")
    expect(body.cobertura.ultimaFecha).toBe("2026-10-14")
    expect(body.cobertura.brechasMayores4Dias).toEqual([
      { desde: "2026-10-01", hasta: "2026-10-08", dias: 7 },
      { desde: "2026-10-08", hasta: "2026-10-14", dias: 6 },
    ])
    expect(body.cobertura.fuenteHistorial).toMatch(/2021-06-22/)
  })
})

describe("/api/poceada-federal/combinaciones — premium", () => {
  it("exige token (401)", async () => {
    const r = await combPOST(req("/api/poceada-federal/combinaciones", { method: "POST" }))
    expect(r.status).toBe(401)
  })

  it("exige nivel premium (403)", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: false } as never)
    const r = await combPOST(
      req("/api/poceada-federal/combinaciones", {
        method: "POST",
        authorization: "Bearer usuario-free",
      })
    )
    expect(r.status).toBe(403)
    expect((await r.json()).error).toBe("no_premium")
  })

  it("flujo completo: genera 5 jugadas, backtest y snapshot pre-sorteo", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: true } as never)
    vi.mocked(historialValidado).mockResolvedValue(historial(100))
    const r = await combPOST(
      req("/api/poceada-federal/combinaciones", {
        method: "POST",
        authorization: "Bearer usuario-premium",
      })
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.jugadas).toHaveLength(5)
    for (const j of body.jugadas) {
      expect(j.numeros).toHaveLength(8)
      expect(new Set(j.numeros).size).toBe(8)
      expect(j.senales.length).toBe(8)
    }
    expect(body.etiqueta).toMatch(/sin ventaja demostrada/)
    expect(body.backtest).toHaveProperty("modelo")
    expect(body.backtest).toHaveProperty("azar")
    expect(body.backtest.muestra).toHaveProperty("evaluaciones")
    expect(body.historial.cantidad).toBe(100)
    expect(body.historial.huella).toMatch(/^[a-f0-9]{16}$/)
    expect(body.prediccionId).toBe("pred-1") // instantánea guardada (append-only)
    expect(body.objetivo).toHaveProperty("confirmado")
    expect(body.sincronizacion).toHaveProperty("datosNuevos")
    expect(body.probabilidadesTeoricas).toHaveProperty("alMenos8")
    expect(insertarSorteos).not.toHaveBeenCalled() // esta ruta no escribe sorteos
  })

  it("GET lista snapshots guardados para premium", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: true } as never)
    vi.mocked(listarPredicciones).mockResolvedValueOnce([])
    const r = await combGET(
      req("/api/poceada-federal/combinaciones", { authorization: "Bearer usuario-premium" })
    )
    expect(r.status).toBe(200)
    expect((await r.json()).ok).toBe(true)
  })

  it("GET deniega sin premium", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: false } as never)
    const r = await combGET(
      req("/api/poceada-federal/combinaciones", { authorization: "Bearer usuario-free" })
    )
    expect(r.status).toBe(403)
  })

  it("GET evalúa una predicción pendiente con el sorteo oficial validado", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: true } as never)
    const pred = {
      id: "pred-p1",
      sorteo_objetivo_concurso: null,
      sorteo_objetivo_confirmado: false,
      generado_en: "2026-10-14T12:00:00.000Z",
      historial_corte_fecha: "2026-10-14",
      historial_corte_concurso: 5732,
      entrenamiento_count: 100,
      historial_huella: "abcdef1234567890",
      algoritmo_version: "pf-test",
      combinaciones: [
        { numeros: [1, 2, 3, 4, 5, 6, 7, 8] },
        { numeros: [11, 12, 13, 14, 15, 16, 17, 18] },
        { numeros: [21, 22, 23, 24, 25, 26, 27, 28] },
        { numeros: [31, 32, 33, 34, 35, 36, 37, 38] },
        { numeros: [41, 42, 43, 44, 45, 46, 47, 48] },
      ],
      estado: "pendiente",
      evaluacion_draw_id: null,
      evaluacion: null,
      creado_en: "2026-10-14T12:00:01.000Z",
    }
    vi.mocked(listarPredicciones).mockResolvedValueOnce([pred] as never)
    vi.mocked(historialValidado).mockResolvedValueOnce([
      {
        concurso: 5735,
        fecha: "2026-10-15",
        numeros: [1, 3, 5, 7, 9, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40],
      },
    ] as never)

    const r = await combGET(
      req("/api/poceada-federal/combinaciones", { authorization: "Bearer usuario-premium" })
    )
    expect(r.status).toBe(200)
    const body = await r.json()
    expect(body.ok).toBe(true)
    expect(body.predicciones).toHaveLength(1)
    expect(body.predicciones[0].estado).toBe("evaluada")
    expect(body.predicciones[0].evaluacion.concursoEvaluado).toBe(5735)
    expect(body.predicciones[0].evaluacion.numerosOficiales).toHaveLength(20)
    expect(body.predicciones[0].evaluacion.aciertosPorJugada).toEqual([4, 4, 4, 4, 0])
    expect(marcarEvaluacion).toHaveBeenCalledWith(
      "pred-p1",
      "draw-1",
      expect.objectContaining({ concursoEvaluado: 5735 })
    )
  })

  it("POST registra el sorteo objetivo cuando la fuente oficial lo confirma", async () => {
    vi.mocked(resolveUserTier).mockResolvedValueOnce({ canAccessPremiumFeatures: true } as never)
    const h = historial(100)
    vi.mocked(historialValidado).mockResolvedValue(h)
    const ultimo = h[h.length - 1]
    const dia = new Date(`${ultimo.fecha}T12:00:00Z`)
    dia.setUTCDate(dia.getUTCDate() + 1)
    vi.mocked(listarSorteosIAFAS).mockResolvedValueOnce([
      { NROSorteo: ultimo.concurso + 1, Fecha2: dia.toISOString().slice(0, 10), Estado: "CONFIRMADO" },
    ] as never)

    const r = await combPOST(
      req("/api/poceada-federal/combinaciones", {
        method: "POST",
        authorization: "Bearer usuario-premium",
      })
    )
    expect(r.status).toBe(200)
    expect(guardarPrediccion).toHaveBeenCalledWith(
      expect.objectContaining({
        sorteo_objetivo_concurso: ultimo.concurso + 1,
        sorteo_objetivo_confirmado: true,
      })
    )
    const body = await r.json()
    expect(body.objetivo.confirmado).toBe(true)
    expect(body.objetivo.concurso).toBe(ultimo.concurso + 1)
  })
})
