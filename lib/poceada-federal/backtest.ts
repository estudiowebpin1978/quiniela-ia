/**
 * Backtesting WALK-FORWARD cronológico de Poceada Federal (sección 4).
 *
 * Protocolo estricto:
 *  1. ordenar todos los sorteos validados cronológicamente
 *  2. punto inicial de entrenamiento (`minTrain`, por defecto 60 sorteos)
 *  3. en cada paso t: entrenar SÓLO con [0..t-1] y generar 5 combinaciones
 *     ANTES de ver el sorteo t (generarCombinaciones jamás recibe el futuro)
 *  4. comparar con el extracto oficial real de t
 *  5. avanzar en el tiempo y repetir (`paso` limita la cantidad de evaluaciones
 *     para mantener el costo acotado; se informa explícitamente)
 *  6. baseline: 5 combinaciones aleatorias distintas (PRNG sembrado,
 *     mismas restricciones: 8 números únicos 00-99 por jugada)
 *  7. diferencias de rendimiento con incertidumbre estadística (IC 95 %
 *     normal aproximado sobre la diferencia pareada por sorteo)
 *
 * Métricas: distribución de aciertos por combinación, promedio por jugada,
 * máximo entre las 5, conteos y proporciones de sorteos con ≥6/7/8 aciertos,
 * comparación contra el azar con tamaño de muestra y períodos explícitos.
 *
 * HONESTIDAD: no se declara ventaja salvo que |diff| > 1.96·EE. Si la muestra
 * es chica, el estado queda "experimental".
 */

import { generarCombinaciones } from "./combinaciones"
import type { SorteoValidado } from "./estadisticas"

export interface OpcionesBacktest {
  minTrain?: number
  paso?: number
  semilla?: number
  maxEvaluaciones?: number
}

export interface ResultadoBacktest {
  version: string
  generadoEn: string
  estado: "ok" | "experimental"
  muestra: {
    evaluaciones: number
    desde: string
    hasta: string
    trainInicial: number
    paso: number
  }
  modelo: {
    aciertosPorJugada: number[][] // [evaluación][jugada 0-4]
    promedioPorJugada: number[] // 5 valores
    promedioGeneral: number
    maximoPorEvaluacion: number[]
    maximoPromedio: number
    conteosMayoresIgual: { g6: number; g7: number; g8: number }
    proporciones: { g6: number; g7: number; g8: number }
  }
  azar: {
    aciertosPorJugada: number[][]
    promedioPorJugada: number[]
    promedioGeneral: number
    maximoPorEvaluacion: number[]
    maximoPromedio: number
    conteosMayoresIgual: { g6: number; g7: number; g8: number }
    proporciones: { g6: number; g7: number; g8: number }
    semilla: number
  }
  diferencia: {
    promedioGeneral: number // modelo - azar
    intervalo95: [number, number]
    errorEstandar: number
    ventajaDemostrada: boolean
  }
  interpretacion: string
}

/** PRNG determinista (mulberry32) para el baseline aleatorio. */
export function mulberry32(semilla: number): () => number {
  let a = semilla >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 8 números únicos 00-99 con Fisher-Yates sobre un PRNG sembrado. */
export function jugadaAleatoria(rnd: () => number): number[] {
  const pool = Array.from({ length: 100 }, (_, i) => i)
  for (let i = 0; i < 8; i++) {
    const j = i + Math.floor(rnd() * (100 - i))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, 8).sort((a, b) => a - b)
}

function aciertos(a: number[], b: number[]): number {
  const s = new Set(b)
  return a.reduce((n, x) => n + (s.has(x) ? 1 : 0), 0)
}

function agregar(
  matriz: number[][],
  conteos: { g6: number; g7: number; g8: number },
  porEvaluacion: number[]
): void {
  let maximo = 0
  for (const fila of matriz) {
    let g6 = 0
    let g7 = 0
    let g8 = 0
    for (const h of fila) {
      if (h >= 6) g6++
      if (h >= 7) g7++
      if (h >= 8) g8++
      if (h > maximo) maximo = h
    }
    conteos.g6 += g6 > 0 ? 1 : 0
    conteos.g7 += g7 > 0 ? 1 : 0
    conteos.g8 += g8 > 0 ? 1 : 0
    porEvaluacion.push(maximo)
  }
}

function promedios(matriz: number[][]): number[] {
  const acum = [0, 0, 0, 0, 0]
  for (const fila of matriz) {
    fila.forEach((h, i) => (acum[i] += h))
  }
  const n = matriz.length || 1
  return acum.map((s) => Number((s / n).toFixed(4)))
}

export function backtestWalkForward(
  sorteos: SorteoValidado[],
  opts: OpcionesBacktest = {}
): ResultadoBacktest {
  const minTrain = opts.minTrain ?? 60
  const semilla = opts.semilla ?? 20261015
  const maxEval = opts.maxEvaluaciones ?? 120
  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.concurso - b.concurso
  )
  const total = ordenados.length
  const disponibles = Math.max(0, total - minTrain)
  const paso = Math.max(1, (opts.paso ?? Math.ceil(disponibles / maxEval)) || 1)

  const pasos: number[] = []
  for (let t = minTrain; t < total; t += paso) pasos.push(t)

  const aciertosModelo: number[][] = []
  const aciertosAzar: number[][] = []

  for (const t of pasos) {
    const train = ordenados.slice(0, t)
    const real = ordenados[t]
    const gen = generarCombinaciones(train, { generadoEn: new Date(0) }) // fecha no relevante aquí
    aciertosModelo.push(gen.jugadas.map((j) => aciertos(j.numeros, real.numeros)))
    const rnd = mulberry32(semilla + t * 7919)
    const cincoAzar: number[][] = []
    const vistos = new Set<string>()
    let guard = 0
    while (cincoAzar.length < 5 && guard++ < 50) {
      const j = jugadaAleatoria(rnd)
      const k = j.join(",")
      if (vistos.has(k)) continue
      vistos.add(k)
      cincoAzar.push(j)
    }
    aciertosAzar.push(cincoAzar.map((j) => aciertos(j, real.numeros)))
  }

  const n = aciertosModelo.length
  const conteosM = { g6: 0, g7: 0, g8: 0 }
  const conteosA = { g6: 0, g7: 0, g8: 0 }
  const maxM: number[] = []
  const maxA: number[] = []
  agregar(aciertosModelo, conteosM, maxM)
  agregar(aciertosAzar, conteosA, maxA)

  const promM = promedios(aciertosModelo)
  const promA = promedios(aciertosAzar)
  const general = (m: number[][]) => {
    const totalA = m.reduce((s, f) => s + f.reduce((a, b) => a + b, 0), 0)
    return Number((totalA / ((m.length || 1) * 5)).toFixed(4))
  }
  const promGenM = general(aciertosModelo)
  const promGenA = general(aciertosAzar)

  // Diferencia pareada por sorteo (promedio de las 5 jugadas) + IC 95 %.
  const diferencias: number[] = []
  for (let i = 0; i < n; i++) {
    const m = aciertosModelo[i].reduce((a, b) => a + b, 0) / 5
    const a = aciertosAzar[i].reduce((x, y) => x + y, 0) / 5
    diferencias.push(m - a)
  }
  const media = diferencias.length
    ? diferencias.reduce((a, b) => a + b, 0) / diferencias.length
    : 0
  const varianza =
    diferencias.length > 1
      ? diferencias.reduce((a, b) => a + (b - media) ** 2, 0) / (diferencias.length - 1)
      : 0
  const ee = Math.sqrt(varianza / Math.max(1, diferencias.length))
  const ic: [number, number] = [media - 1.96 * ee, media + 1.96 * ee]
  const ventaja = n >= 30 && (ic[0] > 0 || ic[1] < 0)

  const estado: ResultadoBacktest["estado"] = n >= 60 ? "ok" : "experimental"
  const interpretacion = ventaja
    ? `Diferencia modelo-azar ${media.toFixed(4)} ± ${ee.toFixed(4)} (IC 95 % [${ic[0].toFixed(4)}, ${ic[1].toFixed(4)}]) con ${n} evaluaciones: estadísticamente distinguible en MUESTRA; requerirá confirmación con datos nuevos.`
    : n === 0
      ? "Sin historial suficiente para evaluar (mínimo 60 sorteos previos)."
      : `Diferencia modelo-azar ${media.toFixed(4)} (IC 95 % [${ic[0].toFixed(4)}, ${ic[1].toFixed(4)}], ${n} evaluaciones): NO se distingue del azar → sin ventaja demostrada.`

  return {
    version: "pf-backtest-1.0.0",
    generadoEn: new Date().toISOString(),
    estado,
    muestra: {
      evaluaciones: n,
      desde: pasos.length ? ordenados[pasos[0]].fecha : "",
      hasta: pasos.length ? ordenados[pasos[pasos.length - 1]].fecha : "",
      trainInicial: minTrain,
      paso,
    },
    modelo: {
      aciertosPorJugada: aciertosModelo,
      promedioPorJugada: promM,
      promedioGeneral: promGenM,
      maximoPorEvaluacion: maxM,
      maximoPromedio: maxM.length
        ? Number((maxM.reduce((a, b) => a + b, 0) / maxM.length).toFixed(4))
        : 0,
      conteosMayoresIgual: conteosM,
      proporciones: {
        g6: n ? Number((conteosM.g6 / n).toFixed(4)) : 0,
        g7: n ? Number((conteosM.g7 / n).toFixed(4)) : 0,
        g8: n ? Number((conteosM.g8 / n).toFixed(4)) : 0,
      },
    },
    azar: {
      aciertosPorJugada: aciertosAzar,
      promedioPorJugada: promA,
      promedioGeneral: promGenA,
      maximoPorEvaluacion: maxA,
      maximoPromedio: maxA.length
        ? Number((maxA.reduce((a, b) => a + b, 0) / maxA.length).toFixed(4))
        : 0,
      conteosMayoresIgual: conteosA,
      proporciones: {
        g6: n ? Number((conteosA.g6 / n).toFixed(4)) : 0,
        g7: n ? Number((conteosA.g7 / n).toFixed(4)) : 0,
        g8: n ? Number((conteosA.g8 / n).toFixed(4)) : 0,
      },
      semilla,
    },
    diferencia: {
      promedioGeneral: Number((promGenM - promGenA).toFixed(4)),
      intervalo95: [Number(ic[0].toFixed(5)), Number(ic[1].toFixed(5))],
      errorEstandar: Number(ee.toFixed(5)),
      ventajaDemostrada: ventaja,
    },
    interpretacion,
  }
}
