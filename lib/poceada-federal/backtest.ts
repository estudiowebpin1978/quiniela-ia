/**
 * Backtesting WALK-FORWARD cronológico de Poceada Federal (sección 4) — v1.1.
 *
 * Protocolo estricto:
 *  1. ordenar todos los sorteos validados cronológicamente
 *  2. punto inicial de entrenamiento (`minTrain`, por defecto 60 sorteos)
 *  3. en cada paso t: entrenar SÓLO con [0..t-1] y generar 5 combinaciones
 *     ANTES de ver el sorteo t (generarCombinaciones jamás recibe el futuro)
 *  4. comparar con el extracto oficial real de t
 *  5. avanzar en el tiempo y repetir (`paso` limita la cantidad de evaluaciones
 *     para mantener el costo acotado; se informa explícitamente)
 *
 * Comparación contra azar con rigor estadístico (v1.1):
 *  - K conjuntos de referencia aleatorios (por defecto 5, semillas fijas y
 *    distintas por conjunto y por evaluación): la diferencia se mide contra el
 *    PROMEDIO de los K conjuntos y se informa la dispersión entre ellos, de modo
 *    que una selección afortunada de un único baseline no decide la comparación.
 *  - IC 95 % normal aproximado sobre la diferencia pareada por sorteo
 *    (modelo − promedio de referencias).
 *  - Prueba de permutación pareada (sign-flips sembrados, por defecto 2000)
 *    como contralor no paramétrico del IC: p < 0,05 exigido para ventaja.
 *  - Estabilidad: diferencia descompuesta en 4 bloques cronológicos; una ventaja
 *    concentrada en un solo bloque se informa como inestable.
 *  - Holdout: últimas ~20 % de las evaluaciones quedan reservadas; si el IC del
 *    período de entrenamiento muestra ventaja pero el holdout la contradice
 *    (IC holdout completamente por debajo de 0), NO se declara ventaja.
 *
 * HONESTIDAD: "ventaja demostrada" exige las 3 condiciones simultáneas
 * (IC 95 % > 0, permutación p < 0,05 y holdout que no contradice). Con muestra
 * chica el estado queda "experimental".
 */

import { generarCombinaciones } from "./combinaciones"
import type { SorteoValidado } from "./estadisticas"

export const VERSION_BACKTEST = "pf-backtest-1.1.0"

export interface OpcionesBacktest {
  minTrain?: number
  paso?: number
  semilla?: number
  maxEvaluaciones?: number
  /** Cantidad K de conjuntos aleatorios de referencia (default 5). */
  conjuntosReferencia?: number
  /** Iteraciones de la prueba de permutación pareada (default 2000). */
  permutaciones?: number
}

export interface BloqueBacktest {
  indice: number // 1..4
  desde: string
  hasta: string
  evaluaciones: number
  diferencia: number // modelo − referencia en el bloque
}

export interface HoldoutBacktest {
  evaluaciones: number
  desde: string
  hasta: string
  diferencia: number
  intervalo95: [number, number]
  /** true si el IC del período reservado queda completamente por debajo de 0. */
  contradice: boolean
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
    aciertosPorJugada: number[][] // promedio por evaluación del mejor conjunto... ver nota abajo
    promedioPorJugada: number[]
    promedioGeneral: number
    maximoPorEvaluacion: number[]
    maximoPromedio: number
    conteosMayoresIgual: { g6: number; g7: number; g8: number }
    proporciones: { g6: number; g7: number; g8: number }
    semilla: number
    /** Detalle de las K referencias: promedio general de cada una. */
    conjuntos: number[]
    desviacionEntreConjuntos: number
  }
  diferencia: {
    promedioGeneral: number // modelo − promedio de las K referencias
    intervalo95: [number, number]
    errorEstandar: number
    ventajaDemostrada: boolean
    /** p-valor de la prueba de permutación pareada (dos colas). */
    pPermutacion: number
    /** K conjuntos de referencia usados. */
    conjuntosReferencia: number
    /** Diferencia modelo−referencia en 4 bloques cronológicos. */
    bloques: BloqueBacktest[]
    /** Período final reservado; null si la muestra no alcanza para reservarlo. */
    holdout: HoldoutBacktest | null
    /** Las 3 condiciones que deben cumplirse para declarar ventaja. */
    condiciones: { ic95: boolean; permutacion: boolean; holdout: boolean }
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

/** 5 combinaciones aleatorias distintas con el mismo contrato que el modelo. */
export function cincoAleatorias(rnd: () => number): number[][] {
  const cinco: number[][] = []
  const vistos = new Set<string>()
  let guard = 0
  while (cinco.length < 5 && guard++ < 50) {
    const j = jugadaAleatoria(rnd)
    const k = j.join(",")
    if (vistos.has(k)) continue
    vistos.add(k)
    cinco.push(j)
  }
  return cinco
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

function redondear(x: number, d = 5): number {
  const f = 10 ** d
  return Math.round(x * f) / f
}

/** Media y EE estándar de una lista de diferencias. */
function resumen(difs: number[]): { media: number; ee: number } {
  const n = difs.length
  if (n === 0) return { media: 0, ee: 0 }
  const media = difs.reduce((a, b) => a + b, 0) / n
  const varianza = n > 1 ? difs.reduce((a, b) => a + (b - media) ** 2, 0) / (n - 1) : 0
  return { media, ee: Math.sqrt(varianza / n) }
}

/**
 * Prueba de permutación pareada (sign-flip) sobre las diferencias por sorteo.
 * Determinista a partir de la semilla; p = (1 + #{|media*| ≥ |media obs|}) / (B+1).
 */
export function permutacionPareada(
  difs: number[],
  iteraciones: number,
  semilla: number
): number {
  if (difs.length === 0) return 1
  const obs = Math.abs(resumen(difs).media)
  const rnd = mulberry32(semilla >>> 0)
  let extremos = 0
  for (let b = 0; b < iteraciones; b++) {
    let suma = 0
    for (let i = 0; i < difs.length; i++) {
      suma += rnd() < 0.5 ? -difs[i] : difs[i]
    }
    if (Math.abs(suma / difs.length) >= obs) extremos++
  }
  return (1 + extremos) / (iteraciones + 1)
}

/**
 * Decisión de "ventaja demostrada": las 3 condiciones simultáneas.
 * Extraída para poder testear el veto del holdout con valores sintéticos.
 */
export function decidirCondiciones(
  n: number,
  ic: [number, number],
  pPermutacion: number,
  holdout: HoldoutBacktest | null
): { ic95: boolean; permutacion: boolean; holdout: boolean; ventaja: boolean } {
  const ic95 = n >= 30 && ic[0] > 0
  const permutacion = pPermutacion < 0.05
  const condHold = holdout !== null && !holdout.contradice
  return { ic95, permutacion, holdout: condHold, ventaja: ic95 && permutacion && condHold }
}

export function backtestWalkForward(
  sorteos: SorteoValidado[],
  opts: OpcionesBacktest = {}
): ResultadoBacktest {
  const minTrain = opts.minTrain ?? 60
  const semilla = opts.semilla ?? 20261015
  const maxEval = opts.maxEvaluaciones ?? 120
  const K = Math.max(1, opts.conjuntosReferencia ?? 5)
  const B = Math.max(100, opts.permutaciones ?? 2000)
  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.concurso - b.concurso
  )
  const total = ordenados.length
  const disponibles = Math.max(0, total - minTrain)
  const paso = Math.max(1, (opts.paso ?? Math.ceil(disponibles / maxEval)) || 1)

  const pasos: number[] = []
  for (let t = minTrain; t < total; t += paso) pasos.push(t)

  const aciertosModelo: number[][] = []
  const aciertosAzar: number[][] = [] // primer conjunto de referencia (conteos enteros)
  const difs: number[] = [] // por evaluación: modelo − promedio de K referencias
  const sumaConjuntos = new Array<number>(K).fill(0)
  const sumaPorPos = [0, 0, 0, 0, 0] // suma por posición sobre los K conjuntos
  const maxM: number[] = []
  const maxA: number[] = []

  for (const t of pasos) {
    const train = ordenados.slice(0, t)
    const real = ordenados[t]
    const gen = generarCombinaciones(train, { generadoEn: new Date(0) }) // fecha no relevante aquí
    const filaModelo = gen.jugadas.map((j) => aciertos(j.numeros, real.numeros))
    aciertosModelo.push(filaModelo)
    const promModelo = filaModelo.reduce((a, b) => a + b, 0) / filaModelo.length

    // K conjuntos de referencia con semillas distintas por conjunto y evaluación
    const porConjunto: number[] = []
    let primeraFila: number[] | null = null
    for (let k = 0; k < K; k++) {
      const rnd = mulberry32((semilla + k * 104729 + t * 7919) >>> 0)
      const cinco = cincoAleatorias(rnd)
      const fila = cinco.map((j) => aciertos(j, real.numeros))
      if (primeraFila === null) primeraFila = fila
      fila.forEach((h, p) => (sumaPorPos[p] += h / K))
      const prom = fila.reduce((a, b) => a + b, 0) / fila.length
      porConjunto.push(prom)
      sumaConjuntos[k] += prom
    }
    aciertosAzar.push(primeraFila ?? [0, 0, 0, 0, 0])
    const promRef = porConjunto.reduce((a, b) => a + b, 0) / K
    difs.push(promModelo - promRef)
  }

  const n = aciertosModelo.length
  const conteosM = { g6: 0, g7: 0, g8: 0 }
  const conteosA = { g6: 0, g7: 0, g8: 0 }
  agregar(aciertosModelo, conteosM, maxM)
  agregar(aciertosAzar, conteosA, maxA)

  const promM = promedios(aciertosModelo)
  // Promedio por posición del azar: promedio sobre los K conjuntos de referencia.
  const nEval = Math.max(1, n)
  const promA = sumaPorPos.map((s) => Number((s / nEval).toFixed(4)))
  const general = (m: number[][]) => {
    const tot = m.reduce((s, f) => s + f.reduce((a, b) => a + b, 0), 0)
    return Number((tot / ((m.length || 1) * 5)).toFixed(4))
  }
  const promGenM = general(aciertosModelo)

  // Referencias: promedio general de cada conjunto K y su dispersión.
  const conjuntosRef = sumaConjuntoRedondeo(sumaConjuntos, Math.max(1, n))
  const mediaRefs = conjuntosRef.reduce((a, b) => a + b, 0) / K
  const varRefs =
    K > 1
      ? conjuntosRef.reduce((a, b) => a + (b - mediaRefs) ** 2, 0) / (K - 1)
      : 0
  const desvRefs = Math.sqrt(varRefs)

  // Diferencia pareada por sorteo + IC 95 %.
  const { media, ee } = resumen(difs)
  const ic: [number, number] = [media - 1.96 * ee, media + 1.96 * ee]

  // Permutación pareada (contralor no paramétrico).
  const pPermutacion = permutacionPareada(difs, B, (semilla ^ 0x9e3779b9) >>> 0)

  // 4 bloques cronológicos de estabilidad.
  const bloques: BloqueBacktest[] = []
  const cantBloques = Math.min(4, n)
  for (let b = 0; b < cantBloques; b++) {
    const i0 = Math.floor((n * b) / cantBloques)
    const i1 = Math.floor((n * (b + 1)) / cantBloques)
    if (i1 <= i0) continue
    const segmento = difs.slice(i0, i1)
    const r = resumen(segmento)
    bloques.push({
      indice: b + 1,
      desde: ordenados[pasos[i0]].fecha,
      hasta: ordenados[pasos[i1 - 1]].fecha,
      evaluaciones: i1 - i0,
      diferencia: redondear(r.media),
    })
  }

  // Holdout: últimas ~20 % de evaluaciones (requiere muestra suficiente).
  let holdout: HoldoutBacktest | null = null
  if (n >= 50) {
    const holdN = Math.min(Math.max(10, Math.round(n * 0.2)), n - 30)
    const ini = n - holdN
    const rHold = resumen(difs.slice(ini))
    const icHold: [number, number] = [
      rHold.media - 1.96 * rHold.ee,
      rHold.media + 1.96 * rHold.ee,
    ]
    holdout = {
      evaluaciones: holdN,
      desde: ordenados[pasos[ini]].fecha,
      hasta: ordenados[pasos[n - 1]].fecha,
      diferencia: redondear(rHold.media),
      intervalo95: [redondear(icHold[0]), redondear(icHold[1])],
      contradice: icHold[1] < 0,
    }
  }

  // Las 3 condiciones: ventaja demostrada sólo si se cumplen todas.
  const { ic95: condIc, permutacion: condPerm, holdout: condHold, ventaja } =
    decidirCondiciones(n, ic, pPermutacion, holdout)

  const estado: ResultadoBacktest["estado"] = n >= 60 ? "ok" : "experimental"
  const f = (x: number) => x.toFixed(4)
  let interpretacion: string
  if (n === 0) {
    interpretacion = "Sin historial suficiente para evaluar (mínimo 60 sorteos previos)."
  } else if (ventaja) {
    interpretacion = `Diferencia modelo-azar ${f(media)} ± ${f(ee)} (IC 95 % [${f(ic[0])}, ${f(ic[1])}], ${n} evaluaciones): ventaja demostrada en las 3 condiciones (IC > 0, permutación p = ${pPermutacion.toFixed(4)} < 0,05, holdout ${holdout?.diferencia !== undefined ? f(holdout.diferencia) : "n/a"} sin contradicción). Requerirá confirmación con datos nuevos.`
  } else {
    const motivos: string[] = []
    if (!condIc) motivos.push("IC 95 % incluye 0")
    if (!condPerm) motivos.push(`permutación p = ${pPermutacion.toFixed(4)} ≥ 0,05`)
    if (!condHold)
      motivos.push(
        holdout === null
          ? "sin holdout (muestra insuficiente)"
          : `holdout contradice (${f(holdout.diferencia)})`
      )
    interpretacion = `Diferencia modelo-azar ${f(media)} (IC 95 % [${f(ic[0])}, ${f(ic[1])}], ${n} evaluaciones): NO se distingue del azar → sin ventaja demostrada. Falla: ${motivos.join("; ")}.`
  }

  return {
    version: VERSION_BACKTEST,
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
      promedioGeneral: redondear(mediaRefs, 4),
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
      conjuntos: conjuntosRef.map((x) => redondear(x, 4)),
      desviacionEntreConjuntos: redondear(desvRefs, 4),
    },
    diferencia: {
      promedioGeneral: redondear(media, 4),
      intervalo95: [redondear(ic[0]), redondear(ic[1])],
      errorEstandar: redondear(ee),
      ventajaDemostrada: ventaja,
      pPermutacion: redondear(pPermutacion, 4),
      conjuntosReferencia: K,
      bloques,
      holdout,
      condiciones: { ic95: condIc, permutacion: condPerm, holdout: condHold },
    },
    interpretacion,
  }
}

function sumaConjuntoRedondeo(sums: number[], n: number): number[] {
  return sums.map((s) => Number((s / n).toFixed(4)))
}
