/**
 * Walk-forward del meta-selector — Quiniela Ciudad (ex Nacional).
 *
 * Protocolo (pliego §4):
 *  1. Orden cronológico estricto; para el corte t el candidato ve SÓLO
 *     sorteos [0..t-1] (sin fuga temporal jamás).
 *  2. Partición ANTES de evaluar: train / validación interna (dentro del
 *     train, últimos ~validFrac) / HOLDOUT final intacto (~holdoutFrac) que
 *     no se usa para pesos ni para elegir candidatos.
 *  3. Los pesos del ensemble salen SÓLO de la validación interna (`ajustarPesos`).
 *  4. Métricas por objetivo (2C cabecera; 3C/4C cuando el runner inyecta el
 *     universo de candidatos) y por turno.
 *  5. Referencias: K conjuntos aleatorios sembrados + modelo de frecuencia
 *     simple, comparados en el MISMO corte.
 *  6. IC 95 % + permutación pareada + 4 bloques + holdout con veto — misma
 *     maquinaria estadística ya testeada en `lib/poceada-federal/backtest.ts`.
 *  7. Detección de duplicación de señales entre candidatos (solape top-K y
 *     Spearman), porque los motores NO son independientes (V6/V7/ML comparten
 *     frecuencia/recencia/markov).
 *
 * HONESTIDAD: una corrida de este módulo es una reconstrucción retrospectiva.
 * NO equivale a predicciones registradas antes del sorteo (esas viven en
 * `engine_predictions_log` desde 2026-10-03). Se declara ventaja sólo si se
 * cumplen las 3 condiciones y aun así requiere confirmación con datos nuevos.
 */

import {
  mulberry32,
  permutacionPareada,
  decidirCondiciones,
  type HoldoutBacktest,
} from "@/lib/poceada-federal/backtest"
import { resolverRanking, rankingFrecuencia } from "./candidatos"
import {
  agregarMetricas2C,
  metrica2C,
  solapeTopK,
  spearman,
} from "./evaluar"
import { ajustarPesos } from "./pesos"
import {
  TURNOS_QUINIELA_CIUDAD,
  VERSION_SELECTOR,
  type CandidatoSelector,
  type MetricasCandidato,
  type PesosSelector,
  type SorteoSelector,
  type SolapeSenales,
} from "./tipos"

export interface ConfigWalkForward {
  turno: string
  /** Sorteos previos mínimos para el primer corte. */
  warmup?: number
  /** Paso entre cortes (1 = todos). */
  step?: number
  /** Tamaño del top-K (10 en la Quiniela Ciudad). */
  topK?: number
  /** Fracción de cortes reservada al holdout final. */
  holdoutFrac?: number
  /** Fracción del train destinada a validación interna de pesos. */
  validFrac?: number
  semilla?: number
  permutaciones?: number
  conjuntosReferencia?: number
  minValid?: number
}

interface MetricaPorCorte {
  cabeza: boolean
  hits2C: number
}

interface CortesEvaluados {
  fechas: string[]
  porCandidato: Record<string, MetricaPorCorte[]>
  meta: MetricaPorCorte[]
  refAleatoria: number[][] // [corte][conjunto K]
}

export interface PeriodoMetricas {
  candidatos: Record<string, MetricasCandidato>
  meta: MetricasCandidato
  refAleatoria: MetricasCandidato
}

export interface DiferenciaConIncertidumbre {
  promedio: number
  intervalo95: [number, number]
  errorEstandar: number
  n: number
  pPermutacion: number
  bloques: { indice: number; desde: string; hasta: string; n: number; promedio: number }[]
  holdout: HoldoutBacktest | null
  condiciones: { ic95: boolean; permutacion: boolean; holdout: boolean }
  ventajaDemostrada: boolean
}

export interface ResultadoSelector {
  version: string
  turno: string
  generadoEn: string
  muestra: {
    totalSorteos: number
    cortes: number
    warmup: number
    step: number
    topK: number
    train: { cortes: number; desde: string; hasta: string }
    valid: { cortes: number; desde: string; hasta: string }
    holdout: { cortes: number; desde: string; hasta: string }
  }
  pesos: PesosSelector
  metricas: {
    train: PeriodoMetricas
    valid: PeriodoMetricas
    holdout: PeriodoMetricas
    total: PeriodoMetricas
  }
  diferencia: {
    /** meta − promedio de K referencias aleatorias, sobre TODOS los cortes. */
    metaVsAzar: DiferenciaConIncertidumbre
    /** meta vs mejor candidato individual (elegido en validación), en holdout. */
    metaVsMejorCandidato: {
      mejor: string
      criterio: "mediaHits2C_en_valid"
      holdout: { promedio: number; intervalo95: [number, number]; pPermutacion: number; n: number }
    } | null
  }
  duplicacion: SolapeSenales[]
  advertencias: string[]
}

/** Ranking aleatorio (permutación de 00-99) con PRNG sembrado. */
export function rankingAleatorio(rnd: () => number): number[] {
  const pool = Array.from({ length: 100 }, (_, i) => i)
  for (let i = 0; i < 99; i++) {
    const j = i + Math.floor(rnd() * (100 - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool
}

/**
 * Fusión de rankings con pesos: rank-average ponderado sobre posición
 * normalizada (1 = mejor). Determinista, escala-invariante y sin dependencia
 * de la dispersión de scores de cada motor.
 */
export function fusionarRankings(
  rankings: Record<string, number[]>,
  pesos: Record<string, number>
): number[] {
  const nombres = Object.keys(rankings)
  const score = new Array(100).fill(0)
  let wTotal = 0
  for (const nm of nombres) {
    const w = pesos[nm] ?? 0
    if (w <= 0) continue
    wTotal += w
    const r = rankings[nm]
    r.forEach((num, i) => {
      score[num] += w * (1 - i / 100)
    })
  }
  if (wTotal <= 0) return Array.from({ length: 100 }, (_, i) => i)
  const idx = score.map((s, i) => [s, i] as [number, number])
  idx.sort((a, b) => b[0] - a[0] || a[1] - b[1])
  return idx.map((x) => x[1])
}

function resumen(difs: number[]): { media: number; ee: number } {
  const n = difs.length
  if (n === 0) return { media: 0, ee: 0 }
  const media = difs.reduce((a, b) => a + b, 0) / n
  const v = n > 1 ? difs.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1) : 0
  return { media, ee: Math.sqrt(v / n) }
}

function red(x: number, d = 5): number {
  const f = 10 ** d
  return Math.round(x * f) / f
}

function m2cAFila(m: MetricaPorCorte): {
  cabezaEnTopK: boolean
  hits2C: number
  rankCabeza: number
  mrr: number
} {
  // rankCabeza/mrr no se guardan por corte para ahorrar memoria en el bucle
  // principal: se reconstruyen sólo para los agregados donde importan.
  return { cabezaEnTopK: m.cabeza, hits2C: m.hits2C, rankCabeza: 0, mrr: 0 }
}

export async function walkForwardSelector(
  sorteos: SorteoSelector[],
  candidatos: CandidatoSelector[],
  cfg: ConfigWalkForward
): Promise<ResultadoSelector> {
  const turno = cfg.turno
  if (!TURNOS_QUINIELA_CIUDAD.includes(turno as (typeof TURNOS_QUINIELA_CIUDAD)[number])) {
    throw new Error(`Turno inválido para Quiniela Ciudad: ${turno}`)
  }
  const warmup = cfg.warmup ?? 60
  const step = Math.max(1, cfg.step ?? 1)
  const topK = cfg.topK ?? 10
  const holdoutFrac = cfg.holdoutFrac ?? 0.2
  const validFrac = cfg.validFrac ?? 0.2
  const semilla = cfg.semilla ?? 20261016
  const B = Math.max(100, cfg.permutaciones ?? 2000)
  const K = Math.max(1, cfg.conjuntosReferencia ?? 5)
  const minValid = cfg.minValid ?? 30

  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha)
  )
  const total = ordenados.length

  const cortes: number[] = []
  for (let t = warmup; t < total; t += step) cortes.push(t)
  const nC = cortes.length

  const advertencias: string[] = [
    "Evaluación RECONSTRUIDA retrospectivamente: no equivale a predicciones registradas antes del sorteo.",
    "Cortes walk-forward dependientes entre sí: IC y p-valores son aproximados (optimistas).",
    `Múltiples candidatos evaluados (${candidatos.length}) sin corrección formal por comparaciones múltiples en la elección del mejor.`,
  ]

  if (nC === 0) {
    return {
      version: VERSION_SELECTOR,
      turno,
      generadoEn: new Date().toISOString(),
      muestra: {
        totalSorteos: total,
        cortes: 0,
        warmup,
        step,
        topK,
        train: { cortes: 0, desde: "", hasta: "" },
        valid: { cortes: 0, desde: "", hasta: "" },
        holdout: { cortes: 0, desde: "", hasta: "" },
      },
      pesos: ajustarPesos({}, { minValid, candidatosEsperados: candidatos.map((c) => c.nombre) }),
      metricas: {
        train: periodosVacios(),
        valid: periodosVacios(),
        holdout: periodosVacios(),
        total: periodosVacios(),
      },
      diferencia: {
        metaVsAzar: diferenciaVacia(),
        metaVsMejorCandidato: null,
      },
      duplicacion: [],
      advertencias: [...advertencias, "Sin cortes evaluados: historial insuficiente para el warmup."],
    }
  }

  // ── Partición ANTES de evaluar ──
  const holdN = Math.min(nC - 1, Math.max(0, Math.round(nC * holdoutFrac)))
  const trainN = nC - holdN
  const validN = Math.min(trainN - 1, Math.max(0, Math.round(trainN * validFrac)))
  const validInicio = trainN - validN // [validInicio, trainN) dentro de los cortes
  const iTrain = cortes.slice(0, trainN)
  const iValid = cortes.slice(validInicio, trainN)
  const iHold = cortes.slice(trainN)
  const fechasDe = (idx: number[]): { desde: string; hasta: string } =>
    idx.length
      ? { desde: ordenados[idx[0]].fecha, hasta: ordenados[idx[idx.length - 1]].fecha }
      : { desde: "", hasta: "" }

  // ── Pasada única: rankings y métricas por corte (anti-fuga por construcción) ──
  const evaluados: CortesEvaluados = {
    fechas: [],
    porCandidato: {},
    meta: [],
    refAleatoria: [],
  }
  for (const c of candidatos) evaluados.porCandidato[c.nombre] = []
  const nombresCandidatos = candidatos.map((c) => c.nombre)
  /** Rankings por corte, cacheados: el ranking de un corte SÓLO depende de su
   *  historial (anti-fuga por construcción) y se reutiliza para el meta y la
   *  duplicación de señales sin recalcular motores costosos (V7/V6/ML). */
  const rankingsPorCorte: Record<string, number[]>[] = []

  const metricasDeRanking = (ranking: number[], t: number): MetricaPorCorte => {
    const m = metrica2C(ranking, ordenados[t], topK)
    return { cabeza: m.cabezaEnTopK, hits2C: m.hits2C }
  }

  for (let i = 0; i < nC; i++) {
    const t = cortes[i]
    const ctx = {
      historial: ordenados.slice(0, t),
      turno,
      asOf: ordenados[t].fecha,
    }
    const rankings: Record<string, number[]> = {}
    for (const c of candidatos) {
      const r = await resolverRanking(c, ctx)
      rankings[c.nombre] = r
      evaluados.porCandidato[c.nombre].push(metricasDeRanking(r, t))
    }
    rankingsPorCorte.push(rankings)
    // Referencias aleatorias K (semillas distintas por corte y conjunto).
    const porConjunto: number[] = []
    for (let k = 0; k < K; k++) {
      const rnd = mulberry32((semilla + k * 104729 + t * 7919) >>> 0)
      porConjunto.push(metricasDeRanking(rankingAleatorio(rnd), t).hits2C)
    }
    evaluados.refAleatoria.push(porConjunto)
    evaluados.fechas.push(ordenados[t].fecha)
    // El ranking meta se calcula después (necesita los pesos de validación).
    evaluados.meta.push({ cabeza: false, hits2C: 0 })
  }

  // ── Pesos SÓLO con la validación interna (dentro del train) ──
  const seriesValid: Record<string, number[]> = {}
  for (const nm of nombresCandidatos) {
    seriesValid[nm] = evaluados.porCandidato[nm]
      .slice(validInicio, trainN)
      .map((m) => m.hits2C)
  }
  const pesos = ajustarPesos(seriesValid, { minValid, candidatosEsperados: nombresCandidatos })
  if (pesos.experimental) {
    advertencias.push(
      `Validación interna insuficiente (${pesos.nValid} < ${minValid} cortes): pesos de referencia uniformes y estado experimental.`
    )
  }

  // ── Meta-ensemble con los pesos fijos (una vez, sin ver el holdout) ──
  for (let i = 0; i < nC; i++) {
    const metaRanking = fusionarRankings(rankingsPorCorte[i], pesos.pesos)
    evaluados.meta[i] = metricasDeRanking(metaRanking, cortes[i])
  }

  // ── Agregados por período ──
  const periodo = (indices: number[]): PeriodoMetricas => {
    const cands: Record<string, MetricasCandidato> = {}
    for (const nm of nombresCandidatos) {
      cands[nm] = agregarMetricas2C(
        indices.map((i) => m2cAFila(evaluados.porCandidato[nm][i]))
      )
    }
    const meta = agregarMetricas2C(indices.map((i) => m2cAFila(evaluados.meta[i])))
    const ref = agregarMetricas2C(
      indices.map((i) => {
        const conj = evaluados.refAleatoria[i]
        const prom = conj.reduce((a, b) => a + b, 0) / Math.max(1, conj.length)
        return { cabezaEnTopK: false, hits2C: prom, rankCabeza: 0, mrr: 0 }
      })
    )
    return { candidatos: cands, meta, refAleatoria: ref }
  }
  const todos = cortes.map((_, i) => i)
  const metricas = {
    train: periodo(todos.slice(0, trainN)),
    valid: periodo(todos.slice(validInicio, trainN)),
    holdout: periodo(todos.slice(trainN)),
    total: periodo(todos),
  }

  // ── Diferencia meta vs azar (K conjuntos) con controles estadísticos ──
  const difs: number[] = []
  for (let i = 0; i < nC; i++) {
    const ref = evaluados.refAleatoria[i].reduce((a, b) => a + b, 0) / K
    difs.push(evaluados.meta[i].hits2C - ref)
  }
  const { media, ee } = resumen(difs)
  const ic: [number, number] = [media - 1.96 * ee, media + 1.96 * ee]
  const p = permutacionPareada(difs, B, (semilla ^ 0x9e3779b9) >>> 0)

  const bloques: DiferenciaConIncertidumbre["bloques"] = []
  const nBloques = Math.min(4, nC)
  for (let b = 0; b < nBloques; b++) {
    const i0 = Math.floor((nC * b) / nBloques)
    const i1 = Math.floor((nC * (b + 1)) / nBloques)
    if (i1 <= i0) continue
    const seg = difs.slice(i0, i1)
    const r = resumen(seg)
    bloques.push({
      indice: b + 1,
      desde: evaluados.fechas[i0],
      hasta: evaluados.fechas[i1 - 1],
      n: i1 - i0,
      promedio: red(r.media),
    })
  }

  let holdout: HoldoutBacktest | null = null
  if (iHold.length > 0 && trainN > 0) {
    const seg = difs.slice(trainN)
    const r = resumen(seg)
    const icH: [number, number] = [r.media - 1.96 * r.ee, r.media + 1.96 * r.ee]
    holdout = {
      evaluaciones: seg.length,
      desde: evaluados.fechas[trainN],
      hasta: evaluados.fechas[nC - 1],
      diferencia: red(r.media),
      intervalo95: [red(icH[0]), red(icH[1])],
      contradice: icH[1] < 0,
    }
  }

  const { ic95: condIc, permutacion: condPerm, holdout: condHold, ventaja } =
    decidirCondiciones(nC, ic, p, holdout)

  // ── meta vs mejor candidato individual (elegido en validación) en holdout ──
  let metaVsMejor: ResultadoSelector["diferencia"]["metaVsMejorCandidato"] = null
  const nombresValid = nombresCandidatos.filter((nm) => seriesValid[nm]?.length)
  if (nombresValid.length > 0 && iHold.length > 0) {
    const mejor = nombresValid.reduce((a, b) => {
      const va = metricas.valid.candidatos[a]?.mediaHits2C ?? -1
      const vb = metricas.valid.candidatos[b]?.mediaHits2C ?? -1
      return vb > va ? b : a
    })
    const difsMejor: number[] = []
    for (let i = trainN; i < nC; i++) {
      difsMejor.push(evaluados.meta[i].hits2C - evaluados.porCandidato[mejor][i].hits2C)
    }
    const r = resumen(difsMejor)
    const icM: [number, number] = [r.media - 1.96 * r.ee, r.media + 1.96 * r.ee]
    metaVsMejor = {
      mejor,
      criterio: "mediaHits2C_en_valid",
      holdout: {
        promedio: red(r.media),
        intervalo95: [red(icM[0]), red(icM[1])],
        pPermutacion: red(permutacionPareada(difsMejor, B, (semilla ^ 0x51ed270b) >>> 0), 4),
        n: difsMejor.length,
      },
    }
  }

  // ── Duplicación de señales entre pares (submuestreo de cortes) ──
  const duplicacion: SolapeSenales[] = []
  const submuestreo = todos.filter((_, i) => i % Math.max(1, Math.ceil(nC / 60)) === 0)
  for (let a = 0; a < nombresCandidatos.length; a++) {
    for (let b = a + 1; b < nombresCandidatos.length; b++) {
      let sol = 0
      let sp = 0
      let m = 0
      for (const i of submuestreo) {
        const ra = rankingsPorCorte[i][nombresCandidatos[a]]
        const rb = rankingsPorCorte[i][nombresCandidatos[b]]
        sol += solapeTopK(ra, rb, topK)
        sp += spearman(ra, rb)
        m++
      }
      if (m > 0) {
        duplicacion.push({
          a: nombresCandidatos[a],
          b: nombresCandidatos[b],
          solapeTopK: red(sol / m, 4),
          spearman: red(sp / m, 4),
        })
      }
    }
  }
  if (duplicacion.some((d) => d.solapeTopK > 0.7)) {
    advertencias.push(
      "Señales fuertemente duplicadas entre algunos candidatos (solape top-K > 0,7): sus pesos no son información independiente."
    )
  }

  return {
    version: VERSION_SELECTOR,
    turno,
    generadoEn: new Date().toISOString(),
    muestra: {
      totalSorteos: total,
      cortes: nC,
      warmup,
      step,
      topK,
      train: { cortes: trainN, ...fechasDe(iTrain.slice(0, trainN)) },
      valid: { cortes: validN, ...fechasDe(iValid) },
      holdout: { cortes: holdN, ...fechasDe(iHold) },
    },
    pesos,
    metricas,
    diferencia: {
      metaVsAzar: {
        promedio: red(media),
        intervalo95: [red(ic[0]), red(ic[1])],
        errorEstandar: red(ee),
        n: nC,
        pPermutacion: red(p, 4),
        bloques,
        holdout,
        condiciones: { ic95: condIc, permutacion: condPerm, holdout: condHold },
        ventajaDemostrada: ventaja,
      },
      metaVsMejorCandidato: metaVsMejor,
    },
    duplicacion,
    advertencias,
  }
}

/** Referencia de frecuencia simple (modelo obligatorio de comparación). */
export function rankingFrecuenciaSimple(historial: SorteoSelector[]): number[] {
  return rankingFrecuencia(historial, historial.length)
}

function periodosVacios(): PeriodoMetricas {
  const vacia: MetricasCandidato = {
    n: 0,
    cabezaEnTopK: 0,
    mediaHits2C: 0,
    rankCabezaMedio: 0,
    mrr: 0,
    acierto3C: null,
    acierto4C: null,
  }
  return { candidatos: {}, meta: vacia, refAleatoria: vacia }
}

function diferenciaVacia(): DiferenciaConIncertidumbre {
  return {
    promedio: 0,
    intervalo95: [0, 0],
    errorEstandar: 0,
    n: 0,
    pPermutacion: 1,
    bloques: [],
    holdout: null,
    condiciones: { ic95: false, permutacion: false, holdout: false },
    ventajaDemostrada: false,
  }
}
