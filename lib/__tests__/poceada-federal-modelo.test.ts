import { describe, it, expect } from "vitest"
import {
  calcularMotor,
  probabilidadTeorica,
  probabilidadesTeoricas,
  comb,
  PROBABILIDAD_MARGINAL_TEORICA,
  type SorteoValidado,
} from "@/lib/poceada-federal/estadisticas"
import {
  generarCombinaciones,
  huellaHistorial,
  VERSION_ALGORITMO,
} from "@/lib/poceada-federal/combinaciones"
import {
  backtestWalkForward,
  mulberry32,
  jugadaAleatoria,
} from "@/lib/poceada-federal/backtest"
import { evaluarPrediccion } from "@/lib/poceada-federal/evaluacion"
import type { PrediccionGuardada } from "@/lib/poceada-federal/repositorio"

/** Historial sintético determinista (no real, sólo para asserts estructurales). */
function historial(n: number): SorteoValidado[] {
  const rnd = mulberry32(42)
  const out: SorteoValidado[] = []
  for (let i = 0; i < n; i++) {
    const pool = Array.from({ length: 100 }, (_, k) => k)
    for (let j = 0; j < 20; j++) {
      const p = j + Math.floor(rnd() * (100 - j))
      ;[pool[j], pool[p]] = [pool[p], pool[j]]
    }
    out.push({
      concurso: 4000 + i,
      fecha: new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10),
      numeros: pool.slice(0, 20).sort((a, b) => a - b),
    })
  }
  return out
}

describe("motor estadístico — descripción honesta del historial", () => {
  const h = historial(300)
  const motor = calcularMotor(h)

  it("cubre los 100 números con muestra completa y coherente", () => {
    expect(motor.muestra).toBe(300)
    expect(motor.desde).toBe("2024-01-01")
    expect(motor.hasta).toBe(h[299].fecha)
    expect(motor.porNumero).toHaveLength(100)
    const suma = motor.porNumero.reduce((a, s) => a + s.apariciones, 0)
    expect(suma).toBe(300 * 20)
    expect(motor.version).toMatch(/pf-estadisticas/)
  })

  it("frecuencia, desviación e incertidumbre por número", () => {
    for (const s of [motor.porNumero[0], motor.porNumero[37], motor.porNumero[99]]) {
      expect(s.frecuenciaHistorica).toBeCloseTo(s.apariciones / 300, 10)
      expect(s.desviacionVsTeorica).toBeCloseTo(s.frecuenciaHistorica - 0.2, 10)
      const se = Math.sqrt(s.frecuenciaHistorica * (1 - s.frecuenciaHistorica) / 300)
      expect(s.errorEstandar).toBeCloseTo(se, 10)
      expect(s.intervalo95[0]).toBeLessThanOrEqual(s.frecuenciaHistorica)
      expect(s.intervalo95[1]).toBeGreaterThanOrEqual(s.frecuenciaHistorica)
      expect(s.intervalo95[0]).toBeGreaterThanOrEqual(0)
      expect(s.intervalo95[1]).toBeLessThanOrEqual(1)
      expect(["alta", "media", "baja"]).toContain(s.incertidumbre)
      expect(s.muestra).toBe(300)
      expect(s.evolucion).toHaveLength(motor.bins)
      expect(s.evolucion.every((v) => v >= 0 && v <= 1)).toBe(true)
    }
    expect(PROBABILIDAD_MARGINAL_TEORICA).toBe(0.2)
  })

  it("coocurrencias regularizadas: simétricas, acotadas y con la fórmula documentada", () => {
    const a = motor.porNumero[0]
    const b = motor.porNumero[1]
    expect(a.coocurrencia[0]).toBe(1)
    expect(a.coocurrencia[1]).toBeCloseTo(b.coocurrencia[0], 10)
    expect(a.coocurrencia.every((v) => v >= 0 && v <= 1)).toBe(true)
    const c01 = h.filter((s) => s.numeros.includes(0) && s.numeros.includes(1)).length
    const alpha = 20
    const esperado = (c01 + alpha * 300 * 0.04) / (300 + alpha)
    expect(a.coocurrencia[1]).toBeCloseTo(esperado, 10)
  })

  it("resumen de distribución coherente (paridad y decenas)", () => {
    expect(motor.resumenDistribucion.pares + motor.resumenDistribucion.impares).toBeCloseTo(1, 10)
    const sumaDecenas = motor.resumenDistribucion.decenasPromedio.reduce((a, b) => a + b, 0)
    expect(sumaDecenas).toBeCloseTo(20, 6) // 20 números por sorteo
    expect(motor.nota).toMatch(/20 %/)
    expect(motor.nota).toMatch(/no implican mayor probabilidad futura/)
  })
})

describe("probabilidades matemáticas (referencia vs rendimiento histórico)", () => {
  it("combinatoria exacta", () => {
    expect(comb(5, 2)).toBe(10)
    expect(comb(52, 5)).toBe(2598960)
    expect(comb(100, 20)).toBeGreaterThan(5e20)
    expect(comb(100, 20)).toBeLessThan(6e20)
  })

  it("P(8 de 8) coincide con la fórmula de muestreo sin reemplazo", () => {
    const p = probabilidadesTeoricas()
    let prod = 1
    for (let j = 0; j < 8; j++) prod *= (20 - j) / (100 - j)
    expect(p.exactamente8).toBeCloseTo(prod, 12)
    expect(p.alMenos8).toBeCloseTo(prod, 12)
  })

  it("monotonía y órdenes de magnitud razonables", () => {
    const p = probabilidadesTeoricas()
    expect(p.alMenos6).toBeGreaterThan(p.alMenos7)
    expect(p.alMenos7).toBeGreaterThan(p.alMenos8)
    expect(p.alMenos8).toBeGreaterThan(0)
    expect(p.alMenos6).toBeGreaterThan(0.0005)
    expect(p.alMenos6).toBeLessThan(0.05)
    expect(probabilidadTeorica(0)).toBeCloseTo(1, 10)
  })
})

describe("generación de 5 combinaciones", () => {
  const h = historial(300)
  const g1 = generarCombinaciones(h, { generadoEn: new Date(0) })
  const g2 = generarCombinaciones(h, { generadoEn: new Date(0) })

  it("produce exactamente 5 jugadas de 8 números únicos válidos y distintas entre sí", () => {
    expect(g1.jugadas).toHaveLength(5)
    for (const j of g1.jugadas) {
      expect(j.numeros).toHaveLength(8)
      expect(new Set(j.numeros).size).toBe(8)
      expect(j.numeros.every((n) => Number.isInteger(n) && n >= 0 && n <= 99)).toBe(true)
      expect([...j.numeros].sort((a, b) => a - b)).toEqual(j.numeros)
      expect(j.explicacion.length).toBeGreaterThan(20)
      expect(j.senales).toHaveLength(8)
      expect(j.senales[0].numero).toMatch(/^\d{2}$/)
    }
    const claves = g1.jugadas.map((j) => j.numeros.join(","))
    expect(new Set(claves).size).toBe(5)
  })

  it("usa las 5 estrategias pedidas, en orden", () => {
    expect(g1.jugadas.map((j) => j.orden)).toEqual([1, 2, 3, 4, 5])
    expect(g1.jugadas.map((j) => j.estrategia)).toEqual([
      "1-frecuencia-historica",
      "2-frecuencia-reciente",
      "3-tendencias-validadas",
      "4-combinado-coocurrencias",
      "5-ensemble-oos",
    ])
  })

  it("es 100 % determinista (misma entrada → misma salida)", () => {
    expect(JSON.stringify(g1)).toBe(JSON.stringify(g2))
    expect(g1.historial.huella).toBe(huellaHistorial(h))
    expect(g1.version).toBe(VERSION_ALGORITMO)
  })

  it("etiqueta honesta: sin ventaja demostrada hasta que el backtest lo pruebe", () => {
    expect(g1.etiqueta).toMatch(/heurísticas/)
    expect(g1.etiqueta).toMatch(/sin ventaja demostrada/)
    expect(g1.ventajaDemostrada).toBeNull()
    expect(g1.probabilidadesTeoricas.alMenos8).toBeGreaterThan(0)
    expect(g1.probabilidadesTeoricas.nota).toMatch(/hipergeométrica/)
  })

  it("informa historial, split cronológico de validación interna y advertencias", () => {
    expect(g1.historial.cantidad).toBe(300)
    expect(g1.historial.desde).toBe("2024-01-01")
    expect(g1.historial.huella).toMatch(/^[a-f0-9]{16}$/)
    expect(g1.historial.entrenamientoSplit).toEqual({ train: 240, validacion: 60 })
    expect(g1.advertencias.length).toBeGreaterThanOrEqual(2)
    expect(g1.advertencias.join(" ")).toMatch(/independiente/)
    expect(g1.advertencias.join(" ")).toMatch(/cronológico/)
    const meta = g1.meta as Record<string, unknown>
    expect([30, 60, 120]).toContain(meta.halflifeElegido)
    const pesos = meta.pesosEnsemble as number[]
    expect(pesos).toHaveLength(4)
    expect(pesos.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 2)
    expect(meta.metricasOos).toHaveProperty("estrategia1")
    expect(meta.betaSolapamiento as number).toBeGreaterThan(0)
  })

  it("con historial corto sigue produciendo y marca experimental", () => {
    const g = generarCombinaciones(historial(30), { generadoEn: new Date(0) })
    expect(g.jugadas).toHaveLength(5)
    expect(g.advertencias[0]).toMatch(/Experimental: sólo 30 sorteos/)
    expect(g.historial.entrenamientoSplit).toBeUndefined()
  })

  it("sin historial no rompe: devuelve jugadas válidas y advertencia", () => {
    const g = generarCombinaciones([], { generadoEn: new Date(0) })
    expect(g.jugadas).toHaveLength(5)
    expect(g.historial.cantidad).toBe(0)
    expect(g.advertencias.join(" ")).toMatch(/Experimental: sólo 0 sorteos/)
  })

  it("la huella cambia si cambia el historial", () => {
    const h2 = historial(300).slice(0, 299)
    expect(huellaHistorial(h2)).not.toBe(huellaHistorial(h))
  })
})

describe("backtesting walk-forward vs aleatorio", () => {
  const h = historial(300)
  const bt = backtestWalkForward(h, { maxEvaluaciones: 70 })

  it("recorre el tiempo con entrenamiento estrictamente previo", () => {
    expect(bt.muestra.evaluaciones).toBe(60)
    expect(bt.muestra.trainInicial).toBe(60)
    expect(bt.muestra.paso).toBe(4)
    expect(bt.muestra.desde).toBe(h[60].fecha)
    expect(bt.muestra.hasta).toBe(h[296].fecha)
    expect(bt.estado).toBe("ok")
  })

  it("aciertos siempre en 0-8, para modelo y azar", () => {
    for (const m of [...bt.modelo.aciertosPorJugada, ...bt.azar.aciertosPorJugada]) {
      expect(m).toHaveLength(5)
      for (const x of m) {
        expect(Number.isInteger(x)).toBe(true)
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(8)
      }
    }
  })

  it("las métricas agregadas son consistentes con la matriz de aciertos", () => {
    const flat = bt.modelo.aciertosPorJugada.flat()
    const prom = flat.reduce((a, b) => a + b, 0) / flat.length
    expect(bt.modelo.promedioGeneral).toBeCloseTo(prom, 3)
    expect(bt.modelo.promedioPorJugada).toHaveLength(5)
    expect(bt.modelo.conteosMayoresIgual.g6).toBeGreaterThanOrEqual(
      bt.modelo.conteosMayoresIgual.g7
    )
    expect(bt.modelo.conteosMayoresIgual.g7).toBeGreaterThanOrEqual(
      bt.modelo.conteosMayoresIgual.g8
    )
    expect(bt.modelo.proporciones.g6).toBeCloseTo(
      bt.modelo.conteosMayoresIgual.g6 / bt.muestra.evaluaciones,
      4
    )
    expect(bt.modelo.maximoPorEvaluacion).toHaveLength(60)
    expect(bt.modelo.maximoPromedio).toBeGreaterThanOrEqual(0)
    expect(bt.modelo.maximoPromedio).toBeLessThanOrEqual(8)
  })

  it("el baseline aleatorio es validable matemáticamente (E[aciertos] = 8·20/100 = 1.6)", () => {
    expect(bt.azar.promedioGeneral).toBeGreaterThan(1.2)
    expect(bt.azar.promedioGeneral).toBeLessThan(2.0)
    expect(bt.azar.semilla).toBe(20261015)
  })

  it("declara la diferencia con incertidumbre e interpretación honesta", () => {
    expect(bt.diferencia.intervalo95[0]).toBeLessThanOrEqual(bt.diferencia.intervalo95[1])
    expect(typeof bt.diferencia.ventajaDemostrada).toBe("boolean")
    expect(bt.interpretacion).toMatch(/NO se distingue del azar|estadísticamente distinguible/)
    if (!bt.diferencia.ventajaDemostrada) {
      expect(bt.interpretacion).toMatch(/sin ventaja demostrada/)
    }
  })

  it("es determinista con la misma semilla (salvo la marca de tiempo)", () => {
    const bt2 = backtestWalkForward(h, { maxEvaluaciones: 70 })
    const limpio = (r: unknown) =>
      JSON.stringify(r, (k, v) => (k === "generadoEn" ? undefined : v))
    expect(limpio(bt2)).toBe(limpio(bt))
  })

  it("con historial insuficiente queda experimental sin inventar métricas", () => {
    const chico = backtestWalkForward(historial(50))
    expect(chico.muestra.evaluaciones).toBe(0)
    expect(chico.estado).toBe("experimental")
    expect(chico.interpretacion).toMatch(/Sin historial suficiente/)
  })
})

describe("baseline aleatorio", () => {
  it("mulberry32 es reproducible y jugadaAleatoria cumple restricciones", () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const seq1 = [a(), a(), a()]
    const seq2 = [b(), b(), b()]
    expect(seq1).toEqual(seq2)

    const j1 = jugadaAleatoria(mulberry32(1))
    const j2 = jugadaAleatoria(mulberry32(1))
    const j3 = jugadaAleatoria(mulberry32(99999))
    expect(j1).toEqual(j2)
    expect(j1).toHaveLength(8)
    expect(new Set(j1).size).toBe(8)
    expect(j1.every((n) => n >= 0 && n <= 99)).toBe(true)
    expect([...j1].sort((x, y) => x - y)).toEqual(j1)
    expect(j1).not.toEqual(j3)
  })
})

describe("evaluación post-hoc de predicciones", () => {
  const objetivo: SorteoValidado = {
    concurso: 9001,
    fecha: "2026-10-02",
    numeros: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
  }

  function pred(over: Partial<PrediccionGuardada> = {}): PrediccionGuardada {
    return {
      id: "p1",
      sorteo_objetivo_concurso: 9001,
      sorteo_objetivo_confirmado: true,
      generado_en: "2026-10-01T12:00:00.000Z",
      historial_corte_fecha: "2026-09-30",
      historial_corte_concurso: 9000,
      entrenamiento_count: 100,
      historial_huella: "abc123",
      algoritmo_version: VERSION_ALGORITMO,
      combinaciones: [
        { numeros: [0, 1, 2, 3, 4, 5, 6, 7] },
        { numeros: [20, 21, 22, 23, 24, 25, 26, 27] },
      ],
      estado: "pendiente",
      evaluacion_draw_id: null,
      evaluacion: null,
      creado_en: "2026-10-01T12:00:00.000Z",
      ...over,
    }
  }

  it("evalúa contra el sorteo objetivo publicado después del registro", () => {
    const { evaluacion, motivo } = evaluarPrediccion(pred(), [objetivo])
    expect(motivo).toBeUndefined()
    expect(evaluacion).not.toBeNull()
    expect(evaluacion!.concursoEvaluado).toBe(9001)
    expect(evaluacion!.fechaEvaluada).toBe("2026-10-02")
    expect(evaluacion!.aciertosPorJugada).toEqual([8, 0])
    expect(evaluacion!.maximo).toBe(8)
    expect(evaluacion!.promedio).toBe(4)
    expect(evaluacion!.alMenos6).toBe(1)
    expect(evaluacion!.alMenos8).toBe(1)
    expect(evaluacion!.sorteoPosteriorAlRegistro).toBe(true)
  })

  it("no evalúa si el sorteo objetivo aún no está publicado", () => {
    const { evaluacion, motivo } = evaluarPrediccion(pred(), [])
    expect(evaluacion).toBeNull()
    expect(motivo).toMatch(/todavía no está publicado/)
  })

  it("sin objetivo confirmado exige resultados posteriores al registro", () => {
    const sinObj = pred({ sorteo_objetivo_confirmado: false, sorteo_objetivo_concurso: null })
    const { evaluacion, motivo } = evaluarPrediccion(sinObj, [])
    expect(evaluacion).toBeNull()
    expect(motivo).toMatch(/posteriores al registro/)
  })

  it("nunca evalúa con un sorteo anterior al registro", () => {
    const previo: SorteoValidado = { ...objetivo, fecha: "2026-09-30" }
    const { evaluacion, motivo } = evaluarPrediccion(pred(), [previo])
    expect(evaluacion).toBeNull()
    expect(motivo).toMatch(/no es posterior al registro/)
  })
})
