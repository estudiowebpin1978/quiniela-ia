/**
 * Motor de predicción del Brinco — enfoque honesto.
 *
 * VERDAD MATEMÁTICA: en un sorteo justo de 6 de 40, TODA combinación de 6
 * números distintos tiene la MISMA probabilidad de acertar el Tradicional:
 *   1 / C(40,6) = 1 / 3.838.380.
 * Ningún método de selección (frecuencia, atraso, "calientes", cobertura)
 * cambia esa probabilidad. Cualquier sistema que afirme lo contrario miente.
 *
 * VENTAJA REAL (parimutuel): el Brinco es POCEADO. Los premios 1°-3° se DIVIDEN
 * entre ganadores. Elegir una combinación que POCA gente juega no aumenta la
 * probabilidad de acertar, pero SÍ aumenta el valor esperado: si acertás, cobrás
 * más porque hay menos que repartir. Ése es el lever que optimiza este motor.
 *
 * Factores implementados (todos reales y conectados al score):
 *  - antiSplit  (dominante): modelo heurístico de sesgo del jugador. Penaliza
 *               números "populares" (redondos 0/10/20/30, espejos 11/22/33,
 *               muy bajos 0-9) que muchos eligen y que provocan división.
 *  - recencia  : frecuencia en la ventana reciente.
 *  - frecuencia: frecuencia en toda la historia usada.
 *  - atraso    : inverso normalizado del gap desde la última aparición.
 *
 * Los pesos están documentados y son inspeccionables. Todo es determinista
 * (RNG semillado del proyecto) — misma historia y semilla → misma jugada.
 */

import { createRng, hashSeed } from "@/lib/math/seeded-rng"
import {
  BRINCO_NUMEROS_POR_JUGADA,
  BRINCO_TOTAL_BOLILLAS,
  formatoCombinacion,
  validarCombinacion,
} from "@/lib/brinco/reglas"

export type ModalidadBrinco = "tradicional" | "junior"

/** Pesos del score compuesto. Suma = 1. antiSplit domina por ser el lever real. */
export const BRINCO_FACTORES_PESO = {
  antiSplit: 0.6,
  recencia: 0.15,
  frecuencia: 0.15,
  atraso: 0.1,
} as const

/** Ventana (en sorteos) para el factor de recencia. */
export const BRINCO_VENTANA_RECENCIA = 10
/** Cantidad de candidatos evaluados (muestreo semillado, honesto). */
export const BRINCO_MUESTREO_CANDIDATOS = 1500
/** Versión del motor (auditoría). */
export const BRINCO_ENGINE_VERSION = "brinco-ev-antissplit-v1"

const AVISO =
  "Análisis estadístico experimental. El Brinco es un sorteo justo: cada combinación de 6 números " +
  "tiene la misma probabilidad de acertar (1/3.838.380). Esta selección optimiza el valor esperado " +
  "minimizando la división del pozo (números menos jugados), no la probabilidad de acierto. " +
  "No se garantiza ningún resultado ni premio. Jugar con responsabilidad."

// ─── Factores por número ────────────────────────────────────────────────────

/**
 * Modelo heurístico de popularidad del jugador (0 = poco jugado, 1 = muy jugado).
 * Basado en sesgos documentados de jugadores de lotería: números redondos,
 * espejos/aesthetic y números muy bajos se eligen más que otros.
 */
export function popularidadHeuristica(n: number): number {
  let pop = 0
  if (n % 10 === 0) pop += 0.4 // redondos: 0, 10, 20, 30
  if (n === 11 || n === 22 || n === 33) pop += 0.2 // espejos
  if (n <= 9) pop += 0.1 // muy bajos (sesgo "primero")
  return Math.min(1, pop)
}

export interface FactoresNumero {
  numero: number
  frecuencia: number // 0..1 (normalizado por el máximo)
  recencia: number // 0..1 (normalizado por el máximo)
  atraso: number // sorteos desde la última aparición (crudo)
  atrasoFactor: number // 0..1 (1 = apareció en el sorteo más reciente)
  antiSplit: number // 0..1 (1 = poco jugado → menos división)
  score: number // compuesto
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x))
}

/**
 * Calcula los factores de los 40 números dada la historia de una modalidad.
 * `historial` = lista cronológica de combinaciones oficiales (6 números) de esa
 * modalidad. Cada número queda con su score compuesto.
 */
export function calcularFactores(historial: number[][]): FactoresNumero[] {
  const n = historial.length
  const frec = new Array<number>(BRINCO_TOTAL_BOLILLAS).fill(0)
  const rec = new Array<number>(BRINCO_TOTAL_BOLILLAS).fill(0)
  const ultimaAparicion = new Array<number>(BRINCO_TOTAL_BOLILLAS).fill(-1)

  const ventana = Math.min(BRINCO_VENTANA_RECENCIA, n)

  for (let i = 0; i < n; i++) {
    for (const num of historial[i]) {
      if (num < 0 || num >= BRINCO_TOTAL_BOLILLAS) continue
      frec[num]++
      ultimaAparicion[num] = i
      if (i >= n - ventana) rec[num]++
    }
  }

  const maxFrec = Math.max(1, ...frec)
  const maxRec = Math.max(1, ...rec)
  const maxAtraso = Math.max(1, n)

  const factores: FactoresNumero[] = []
  for (let num = 0; num < BRINCO_TOTAL_BOLILLAS; num++) {
    const frecuencia = frec[num] / maxFrec
    const recencia = rec[num] / maxRec
    const atraso = ultimaAparicion[num] === -1 ? n : n - 1 - ultimaAparicion[num]
    const atrasoFactor = 1 - atraso / maxAtraso
    const antiSplit = clamp01(1 - popularidadHeuristica(num))
    const score =
      BRINCO_FACTORES_PESO.antiSplit * antiSplit +
      BRINCO_FACTORES_PESO.recencia * recencia +
      BRINCO_FACTORES_PESO.frecuencia * frecuencia +
      BRINCO_FACTORES_PESO.atraso * atrasoFactor
    factores.push({ numero: num, frecuencia, recencia, atraso, atrasoFactor, antiSplit, score })
  }
  return factores
}

// ─── Objetivo a nivel de combinación ───────────────────────────────────────

/**
 * Objetivo de una combinación: suma de scores de sus miembros + bonus de
 * balance (cobertura de decenas y paridad) − penalización por patrones obvios
 * (corridas, clumps, todo par/impar, toda una decena). Estos patrones son los
 * que muchos jugadores "sistemáticos" eligen → evitarlos reduce la división.
 */
export function objetivoCombinacion(nums: number[], scoreDe: Map<number, number>): number {
  let base = 0
  for (const n of nums) base += scoreDe.get(n) ?? 0

  const decadas = new Set(nums.map((n) => Math.floor(n / 10))).size
  const pares = nums.filter((n) => n % 2 === 0).length
  const impares = nums.length - pares
  const balanceBonus = (decadas - 1) * 0.5 + Math.min(pares, impares) * 0.1

  const sorted = [...nums].sort((a, b) => a - b)
  let maxRun = 1
  let run = 1
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      run++
      maxRun = Math.max(maxRun, run)
    } else {
      run = 1
    }
  }

  let penalty = 0
  if (maxRun >= 3) penalty += (maxRun - 2) * 0.4 // corridas largas
  if (sorted[sorted.length - 1] - sorted[0] <= 9) penalty += 0.6 // clump en ~una decena
  if (pares === nums.length || impares === nums.length) penalty += 0.5 // todo par o todo impar
  if (decadas === 1) penalty += 0.8 // toda una sola decena

  return base + balanceBonus - penalty
}

// ─── Selección ──────────────────────────────────────────────────────────────

function elegirPonderado(candidatos: number[], pesos: number[], rng: () => number): number {
  let total = 0
  for (const p of pesos) total += p
  let r = rng() * total
  for (let i = 0; i < candidatos.length; i++) {
    r -= pesos[i]
    if (r <= 0) return candidatos[i]
  }
  return candidatos[candidatos.length - 1]
}

export interface OpcionesMotor {
  /** Semilla determinista (p.ej. concurso objetivo). Misma entrada → misma salida. */
  semilla: number
  alternativas?: number
  candidatos?: number
}

export interface PrediccionBrinco {
  modalidad: ModalidadBrinco
  combinacion: number[] // 6 números primarios (enteros)
  combinacionFormateada: string[]
  alternativas: number[][] // combinaciones distintas válidas
  factores: FactoresNumero[] // ordenados por score desc (para UI explicable)
  pesos: typeof BRINCO_FACTORES_PESO
  objetivo: number
  nHistorico: number
  datosHasta: string | null
  engineVersion: string
  muestreo: { algoritmo: string; iteraciones: number; semilla: number }
  aviso: string
}

/**
 * Genera una jugada primaria de 6 números + alternativas, a partir de la
 * historia validada de la modalidad. Determinista y explicable.
 */
export function generarPrediccionBrinco(
  modalidad: ModalidadBrinco,
  historial: number[][],
  opciones: OpcionesMotor,
  datosHasta: string | null = null,
): PrediccionBrinco {
  const factores = calcularFactores(historial)
  const scoreDe = new Map(factores.map((f) => [f.numero, f.score]))
  const pesosNumeros = factores.map((f) => Math.pow(Math.max(0.02, f.score), 2))
  const universo = factores.map((f) => f.numero)

  const iteraciones = opciones.candidatos ?? BRINCO_MUESTREO_CANDIDATOS
  const nAlt = opciones.alternativas ?? 2
  const rng = createRng(opciones.semilla)

  // 1. Muestrear `iteraciones` combinaciones de 6 números (sin reemplazo,
  //    ponderado por score). Muestreo semillado y documentado.
  const candidatos: number[][] = []
  for (let it = 0; it < iteraciones; it++) {
    const pool = universo.slice()
    const poolPesos = pesosNumeros.slice()
    const combo: number[] = []
    while (combo.length < BRINCO_NUMEROS_POR_JUGADA) {
      const idx = elegirPonderado(
        pool.map((_, i) => i),
        poolPesos,
        rng,
      )
      const num = pool[idx]
      combo.push(num)
      pool.splice(idx, 1)
      poolPesos.splice(idx, 1)
    }
    candidatos.push(combo)
  }

  // 2. Elegir el mejor por objetivo.
  let mejor = candidatos[0]
  let mejorObj = objetivoCombinacion(mejor, scoreDe)
  for (const c of candidatos) {
    const o = objetivoCombinacion(c, scoreDe)
    if (o > mejorObj) {
      mejor = c
      mejorObj = o
    }
  }

  // 3. Alternativas diversas (bajo solapamiento con las ya elegidas).
  const elegidas: number[][] = [mejor]
  const alternativas: number[][] = []
  const ordenados = candidatos
    .map((c) => ({ c, o: objetivoCombinacion(c, scoreDe) }))
    .sort((a, b) => b.o - a.o)
  for (const { c } of ordenados) {
    if (alternativas.length >= nAlt) break
    const solapMax = Math.max(
      ...elegidas.map((e) => c.filter((x) => e.includes(x)).length),
    )
    if (solapMax <= 2 && !elegidas.some((e) => mismaCombinacion(e, c))) {
      elegidas.push(c)
      alternativas.push(c)
    }
  }

  const ordenadosFactores = [...factores].sort((a, b) => b.score - a.score)

  return {
    modalidad,
    combinacion: [...mejor].sort((a, b) => a - b),
    combinacionFormateada: formatoCombinacion(mejor),
    alternativas: alternativas.map((a) => [...a].sort((x, y) => x - y)),
    factores: ordenadosFactores,
    pesos: BRINCO_FACTORES_PESO,
    objetivo: mejorObj,
    nHistorico: historial.length,
    datosHasta,
    engineVersion: BRINCO_ENGINE_VERSION,
    muestreo: { algoritmo: "muestreo ponderado semillado (xorshift32)", iteraciones, semilla: opciones.semilla },
    aviso: AVISO,
  }
}

function mismaCombinacion(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y).join(",")
  const sb = [...b].sort((x, y) => x - y).join(",")
  return sa === sb
}

/** Valida que una predicción sea una jugada legal de Brinco (guard en servidor). */
export function validarPrediccionServidor(numeros: unknown) {
  return validarCombinacion(numeros)
}
