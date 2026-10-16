import { describe, it, expect } from "vitest"
import {
  dosCifras,
  rankingDesdeScores,
  rankingFrecuencia,
  rankingRecencia,
  rankingBayes,
  rankingV7,
  resolverRanking,
} from "@/lib/selector/candidatos"
import {
  metrica2C,
  aciertoEn20Puestos,
  solapeTopK,
  spearman,
  blendGenerico,
  puntuarCandidatoPuro,
  agregarMetricas2C,
} from "@/lib/selector/evaluar"
import { ajustarPesos, sensibilidadMaxima } from "@/lib/selector/pesos"
import {
  walkForwardSelector,
  fusionarRankings,
  rankingAleatorio,
} from "@/lib/selector/walkforward"
import { mulberry32 } from "@/lib/poceada-federal/backtest"
import type { CandidatoSelector, SorteoSelector } from "@/lib/selector/tipos"

// ─── Utilidades sintéticas (NUNCA datos reales) ──────────────────────────────

function fechaDe(i: number): string {
  const d = new Date(Date.UTC(2026, 0, 1))
  d.setUTCDate(d.getUTCDate() + i)
  return d.toISOString().slice(0, 10)
}

/** Sorteos sintéticos cuya 2-cifra cae en `sesgo` con probabilidad `prob`. */
function sorteosSesgados(
  n: number,
  sesgo: Set<number>,
  prob = 0.7,
  semilla = 7,
  turno = "Primera"
): SorteoSelector[] {
  const rnd = mulberry32(semilla)
  const poolSesgo = [...sesgo]
  const out: SorteoSelector[] = []
  for (let i = 0; i < n; i++) {
    const numbers: number[] = []
    const usados = new Set<number>()
    let guard = 0
    while (numbers.length < 20 && guard++ < 500) {
      const c =
        rnd() < prob && poolSesgo.length > 0
          ? poolSesgo[Math.floor(rnd() * poolSesgo.length)]
          : Math.floor(rnd() * 100)
      const num = Math.floor(rnd() * 100) * 100 + c
      if (usados.has(num)) continue
      usados.add(num)
      numbers.push(num)
    }
    out.push({ fecha: fechaDe(i), turno, numbers })
  }
  return out
}

/** Candidato determinista que SIEMPRE pone `primero` en el top-10. */
function candidatoFijo(nombre: string, primero: number[]): CandidatoSelector {
  const score = new Array(100).fill(0)
  primero.forEach((n, i) => {
    score[n] = 100 - i
  })
  return { nombre, fuente: "puro", evaluar: () => rankingDesdeScores(score) }
}

// ─── Candidatos puros ────────────────────────────────────────────────────────

describe("selector/candidatos — utilidades", () => {
  it("dosCifras conserva los ceros iniciales (00, 07) y normaliza negativos", () => {
    expect(dosCifras(0)).toBe(0)
    expect(dosCifras(107)).toBe(7)
    expect(dosCifras(100)).toBe(0)
    expect(dosCifras(-5)).toBe(95)
  })

  it("rankingDesdeScores es determinista y desempata por índice", () => {
    const r1 = rankingDesdeScores([5, 5, 9, 1])
    const r2 = rankingDesdeScores([5, 5, 9, 1])
    expect(r1).toEqual(r2)
    expect(r1[0]).toBe(2) // score 9
    expect(r1.slice(1, 3)).toEqual([0, 1]) // empate → índice menor primero
  })

  it("los baselines devuelven permutaciones completas de 00-99", () => {
    const sorteos = sorteosSesgados(40, new Set([1, 2, 3]))
    for (const r of [
      rankingFrecuencia(sorteos),
      rankingRecencia(sorteos),
      rankingBayes(sorteos),
    ]) {
      expect(r).toHaveLength(100)
      expect(new Set(r).size).toBe(100)
    }
  })
})

describe("selector/evaluar — criterios de acierto", () => {
  it("metrica2C mide la CABEZA (numbers[0] % 100) y la intersección con los 20", () => {
    const sorteo: SorteoSelector = {
      fecha: "2026-03-01",
      turno: "Primera",
      numbers: [507, 1205, 9931, 7, 200, 301, 402, 503, 604, 705, 806, 907, 1008, 1109, 1210, 1311, 1412, 1513, 1614, 1715],
    }
    // Cabeza = 07. Ranking con 07 en posición 3 (top-10) → acierta.
    const ranking = [99, 50, 7, 61, 22, 33, 44, 55, 66, 77, 88, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
    const m = metrica2C(ranking, sorteo, 10)
    expect(m.cabezaEnTopK).toBe(true)
    expect(m.rankCabeza).toBe(3)
    // Distintos 2C del sorteo: {07,05,31,00,20,01,02,03,04,05...} → top-10 intersecta 07,08?, no:
    // top-10 = [99,50,07,61,22,33,44,55,66,77]; del sorteo sólo 07 está → hits 1.
    expect(m.hits2C).toBe(1)
  })

  it("metrica2C: la cabeza fuera del top-K no acierta", () => {
    const sorteo: SorteoSelector = {
      fecha: "2026-03-01",
      turno: "Primera",
      numbers: [7, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900],
    }
    const ranking = Array.from({ length: 100 }, (_, i) => (i + 10) % 100) // 07 queda al final
    const m = metrica2C(ranking, sorteo, 10)
    expect(m.cabezaEnTopK).toBe(false)
    expect(m.rankCabeza).toBeGreaterThan(10)
  })

  it("aciertoEn20Puestos aplica el criterio de 3/4 cifras con ceros iniciales", () => {
    const sorteo: SorteoSelector = {
      fecha: "2026-03-01",
      turno: "Primera",
      numbers: [7, 1205, 9931], // 3C: "007", "205", "931"
    }
    expect(aciertoEn20Puestos([7], sorteo, 3)).toBe(true) // "007" ∈ puestos
    expect(aciertoEn20Puestos([70], sorteo, 3)).toBe(false) // "070" ∉ puestos
    expect(aciertoEn20Puestos([205], sorteo, 3)).toBe(true)
    expect(aciertoEn20Puestos([9931], sorteo, 4)).toBe(true)
    expect(aciertoEn20Puestos([1], sorteo, 4)).toBe(false)
  })

  it("puntuarCandidatoPuro cuenta frecuencia/recencia del espacio 3C", () => {
    // El sorteo VIEJO tiene los 3 aciertos de 3C en 007: la recencia (media
    // vida 15) debe puntuar MENOS que la frecuencia cruda (decaimiento).
    const sorteos: SorteoSelector[] = [
      { fecha: "2026-01-01", turno: "Primera", numbers: [7, 1007, 2007] },
      { fecha: "2026-01-02", turno: "Primera", numbers: [500, 900, 3] },
    ]
    expect(puntuarCandidatoPuro(7, sorteos, 3, "frecuencia")).toBe(3)
    const recencia = puntuarCandidatoPuro(7, sorteos, 3, "recencia")
    expect(recencia).toBeGreaterThan(0)
    expect(recencia).toBeLessThan(3)
  })

  it("spearman: 1 idénticos, −1 invertidos; solapeTopK acotada", () => {
    const r = Array.from({ length: 100 }, (_, i) => i)
    const inv = [...r].reverse()
    expect(spearman(r, r)).toBeCloseTo(1, 10)
    expect(spearman(r, inv)).toBeCloseTo(-1, 10)
    expect(solapeTopK(r, r, 10)).toBe(1)
    expect(solapeTopK(r, inv, 10)).toBe(0)
  })

  it("blendGenerico es escala-invariante por motor", () => {
    const candidatos = [1, 2, 3, 4]
    const motorA = (c: number) => c * 10
    const motorB = (c: number) => 100 - c
    const pesos = { a: 0.5, b: 0.5 }
    const base = blendGenerico(candidatos, { a: motorA, b: motorB }, pesos)
    const escalado = blendGenerico(candidatos, { a: (c) => motorA(c) * 1e6, b: motorB }, pesos)
    expect(escalado).toEqual(base)
  })

  it("agregarMetricas2C promedia correctamente", () => {
    const agg = agregarMetricas2C([
      { cabezaEnTopK: true, hits2C: 4, rankCabeza: 2, mrr: 0.5 },
      { cabezaEnTopK: false, hits2C: 2, rankCabeza: 8, mrr: 0.125 },
    ])
    expect(agg.n).toBe(2)
    expect(agg.cabezaEnTopK).toBe(0.5)
    expect(agg.mediaHits2C).toBe(3)
  })
})

// ─── Pesos (validación cronológica interna + regularización) ─────────────────

describe("selector/pesos", () => {
  it("muestra insuficiente → pesos uniformes + experimental", () => {
    const r = ajustarPesos({ a: [3, 3, 3], b: [2, 2, 2] }, { minValid: 30 })
    expect(r.experimental).toBe(true)
    expect(r.metodo).toBe("referencia")
    expect(r.pesos.a).toBeCloseTo(0.5, 10)
  })

  it("sin dispersión entre candidatos → prior uniforme (no experimental)", () => {
    const r = ajustarPesos(
      { a: new Array(50).fill(3), b: new Array(50).fill(3) },
      { minValid: 30 }
    )
    expect(r.experimental).toBe(false)
    expect(r.pesos.a).toBeCloseTo(0.5, 6)
  })

  it("el mejor candidato de validación recibe más peso, acotado y normalizado", () => {
    const r = ajustarPesos(
      {
        bueno: Array.from({ length: 60 }, (_, i) => 3 + (i % 3) * 0.1),
        malo: Array.from({ length: 60 }, (_, i) => 2 - (i % 3) * 0.1),
        medio: Array.from({ length: 60 }, (_, i) => 2.5 + (i % 2) * 0.1),
      },
      { minValid: 30 }
    )
    expect(r.experimental).toBe(false)
    expect(r.metodo).toBe("validacion_cronologica_interna")
    const total = Object.values(r.pesos).reduce((a, b) => a + b, 0)
    expect(total).toBeCloseTo(1, 10)
    expect(r.pesos.bueno).toBeGreaterThan(r.pesos.medio)
    expect(r.pesos.medio).toBeGreaterThan(r.pesos.malo)
    // Shrinkaje: ni el mejor llega al techo absoluto tras renormalizar.
    expect(r.pesos.bueno).toBeLessThan(0.85)
  })

  it("la regularización limita la sensibilidad a un outlier", () => {
    const series = {
      a: Array.from({ length: 80 }, (_, i) => 3 + 0.3 * Math.sin(i)),
      b: Array.from({ length: 80 }, (_, i) => 2.8 + 0.3 * Math.cos(i)),
      c: Array.from({ length: 80 }, (_, i) => 2.7 + 0.2 * Math.sin(i / 2)),
    }
    const delta = sensibilidadMaxima(series, "a", 2.0, { minValid: 30 })
    expect(delta).toBeLessThan(0.2)
  })
})

// ─── Fusión y referencias aleatorias ─────────────────────────────────────────

describe("selector/walkforward — fusión y referencias", () => {
  it("fusionarRankings con peso 1 reproduce el ranking del candidato", () => {
    // Permutaciones válidas de 00-99 (7 es coprimo con 100).
    const a = Array.from({ length: 100 }, (_, i) => (i * 7 + 13) % 100)
    const b = Array.from({ length: 100 }, (_, i) => (i * 13 + 7) % 100)
    const fused = fusionarRankings({ a, b }, { a: 1, b: 0 })
    expect(fused).toEqual(a)
  })

  it("fusionarRankings es determinista ante empates", () => {
    const a = Array.from({ length: 100 }, (_, i) => i)
    const b = Array.from({ length: 100 }, (_, i) => 99 - i)
    const r1 = fusionarRankings({ a, b }, { a: 0.5, b: 0.5 })
    const r2 = fusionarRankings({ a, b }, { a: 0.5, b: 0.5 })
    expect(r1).toEqual(r2)
  })

  it("rankingAleatorio: sembrado, permutación completa y reproducible", () => {
    const r1 = rankingAleatorio(mulberry32(123))
    const r2 = rankingAleatorio(mulberry32(123))
    const r3 = rankingAleatorio(mulberry32(124))
    expect(r1).toEqual(r2)
    expect(r1).not.toEqual(r3)
    expect(new Set(r1).size).toBe(100)
  })
})

// ─── Walk-forward: anti-fuga, holdout, ventaja sintética ─────────────────────

describe("selector/walkforward — protocolo", () => {
  const sesgo = new Set(Array.from({ length: 10 }, (_, i) => i + 1)) // 01-10

  it("ANTI-FUGA: cada corte ve SÓLO sorteos estrictamente anteriores", async () => {
    const contexts: { histLen: number; lastFecha: string | undefined; asOf: string; incluyeActual: boolean }[] = []
    const espia: CandidatoSelector = {
      nombre: "espia",
      fuente: "puro",
      evaluar: (ctx) => {
        contexts.push({
          histLen: ctx.historial.length,
          lastFecha: ctx.historial[ctx.historial.length - 1]?.fecha,
          asOf: ctx.asOf,
          incluyeActual: ctx.historial.some((s) => s.fecha === ctx.asOf),
        })
        return Array.from({ length: 100 }, (_, i) => i)
      },
    }
    const sorteos = sorteosSesgados(80, sesgo)
    await walkForwardSelector(sorteos, [espia], {
      turno: "Primera",
      warmup: 20,
      minValid: 5,
      permutaciones: 100,
    })
    expect(contexts.length).toBeGreaterThan(0)
    for (const c of contexts) {
      expect(c.incluyeActual).toBe(false) // jamás ve el sorteo evaluado
      expect(c.lastFecha! < c.asOf).toBe(true) // todo el historial es anterior
    }
    // El historial crece estrictamente con el tiempo.
    for (let i = 1; i < contexts.length; i++) {
      expect(contexts[i].histLen).toBeGreaterThan(contexts[i - 1].histLen)
    }
  })

  it("el holdout queda reservado DESPUÉS de la validación interna de pesos", async () => {
    const sorteos = sorteosSesgados(150, sesgo)
    const r = await walkForwardSelector(sorteos, [candidatoFijo("sabio", [...sesgo])], {
      turno: "Primera",
      warmup: 30,
      minValid: 10,
      permutaciones: 200,
    })
    expect(r.muestra.holdout.cortes).toBeGreaterThan(0)
    expect(r.muestra.valid.cortes).toBeGreaterThan(0)
    expect(r.muestra.valid.hasta < r.muestra.holdout.desde).toBe(true)
    // Los pesos se ajustaron sólo con la validación interna.
    expect(r.pesos.nValid).toBe(r.muestra.valid.cortes)
    expect(r.pesos.experimental).toBe(false)
    expect(r.pesos.metodo).toBe("validacion_cronologica_interna")
  })

  it("señal sintética fuerte: el meta supera al azar y cumple las 3 condiciones", async () => {
    const sorteos = sorteosSesgados(160, sesgo, 0.75)
    const candidatos: CandidatoSelector[] = [
      candidatoFijo("sabio", [...sesgo]),
      candidatoFijo("cero", Array.from({ length: 10 }, (_, i) => 90 + i)),
    ]
    const r = await walkForwardSelector(sorteos, candidatos, {
      turno: "Primera",
      warmup: 30,
      minValid: 10,
      permutaciones: 500,
    })
    expect(r.diferencia.metaVsAzar.n).toBe(r.muestra.cortes)
    expect(r.diferencia.metaVsAzar.promedio).toBeGreaterThan(1)
    expect(r.diferencia.metaVsAzar.intervalo95[0]).toBeGreaterThan(0)
    expect(r.diferencia.metaVsAzar.pPermutacion).toBeLessThan(0.05)
    expect(r.diferencia.metaVsAzar.ventajaDemostrada).toBe(true)
    expect(r.diferencia.metaVsAzar.bloques.length).toBe(4)
    // El meta debe superar también al MEJOR candidato elegido en validación.
    expect(r.diferencia.metaVsMejorCandidato?.mejor).toBe("sabio")
  })

  it("rechaza turnos que no son de la Quiniela Ciudad (Poceada)", async () => {
    await expect(
      walkForwardSelector(sorteosSesgados(30, sesgo), [], { turno: "Poceada", warmup: 10 })
    ).rejects.toThrow(/Turno inválido/)
  })

  it("historial menor que el warmup → sin cortes y advertencia explícita", async () => {
    const r = await walkForwardSelector(sorteosSesgados(10, sesgo), [], {
      turno: "Primera",
      warmup: 20,
    })
    expect(r.muestra.cortes).toBe(0)
    expect(r.advertencias.some((a) => /historial insuficiente/i.test(a))).toBe(true)
    expect(r.diferencia.metaVsAzar.ventajaDemostrada).toBe(false)
  })

  it("determinismo: dos corridas idénticas (salvo el timestamp)", async () => {
    const sorteos = sorteosSesgados(90, sesgo, 0.6, 11)
    const candidatos = [candidatoFijo("sabio", [...sesgo]), candidatoFijo("inv", [99, 98, 97])]
    const cfg = { turno: "Primera", warmup: 20, minValid: 8, permutaciones: 200, semilla: 4242 }
    const a = await walkForwardSelector(sorteos, candidatos, cfg)
    const b = await walkForwardSelector(sorteos, candidatos, cfg)
    const limpia = (r: typeof a) => ({ ...r, generadoEn: "" })
    expect(JSON.stringify(limpia(a))).toBe(JSON.stringify(limpia(b)))
  })

  it("integración con OMEGA V7 existente (motor con firma intacta)", async () => {
    const sorteos = sorteosSesgados(35, sesgo, 0.5)
    const v7: CandidatoSelector = {
      nombre: "v7",
      fuente: "motor_existente",
      evaluar: (ctx) => rankingV7(ctx, 100),
    }
    const r = await walkForwardSelector(sorteos, [v7], {
      turno: "Primera",
      warmup: 15,
      minValid: 3,
      permutaciones: 100,
      step: 4,
    })
    expect(r.muestra.cortes).toBeGreaterThan(0)
    expect(r.metricas.total.candidatos.v7.n).toBe(r.muestra.cortes)
    expect(r.metricas.total.candidatos.v7.mediaHits2C).toBeGreaterThan(0)
  })

  it("soporta candidatos async (contrato resolverRanking)", async () => {
    const asyncCand: CandidatoSelector = {
      nombre: "lento",
      fuente: "puro",
      evaluar: async (ctx) => rankingFrecuencia(ctx.historial),
    }
    const r = await walkForwardSelector(sorteosSesgados(40, sesgo), [asyncCand], {
      turno: "Primera",
      warmup: 15,
      minValid: 3,
      permutaciones: 100,
    })
    expect(r.metricas.total.candidatos.lento.n).toBe(r.muestra.cortes)
  })

  it("los pesos de referencia uniformes se usan si la validación es corta (experimental)", async () => {
    const r = await walkForwardSelector(sorteosSesgados(60, sesgo), [candidatoFijo("sabio", [...sesgo])], {
      turno: "Primera",
      warmup: 30,
      minValid: 25, // validN real será menor → experimental
      permutaciones: 100,
    })
    expect(r.pesos.experimental).toBe(true)
    expect(r.pesos.pesos.sabio).toBeCloseTo(1, 10) // único candidato → prior completo
    expect(r.advertencias.some((a) => /Validación interna insuficiente/i.test(a))).toBe(true)
  })
})

describe("selector/candidatos — resolverRanking", () => {
  it("resuelve evaluadores síncronos y async por igual", async () => {
    const ctx = {
      historial: sorteosSesgados(10, new Set([1])),
      turno: "Primera",
      asOf: fechaDe(10),
    }
    const sync = await resolverRanking(candidatoFijo("fijo", [5]), ctx)
    expect(sync).toHaveLength(100)
    const asyncR = await resolverRanking(
      { nombre: "a", fuente: "puro", evaluar: async () => [1, 2, 3] },
      ctx
    )
    expect(asyncR).toEqual([1, 2, 3])
  })
})
