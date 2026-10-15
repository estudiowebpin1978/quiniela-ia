/**
 * Generador de las 5 combinaciones de Poceada Federal basadas en el
 * historial oficial validado (secciones 2 y 3 del requerimiento).
 *
 * Cinco estrategias candidatas (familias, no verdades):
 *  1. frecuencias históricas regularizadas hacia el 20 % teórico
 *  2. frecuencia reciente con ponderación exponencial temporal
 *  3. tendencias históricas con selección de hiperparámetros por VALIDACIÓN
 *     FUERA DE MUESTRA interna (split cronológico estricto: se entrena con el
 *     80 % inicial y se puntúa sobre el 20 % final; nunca se ve el futuro)
 *  4. combinado frecuencia+recencia con afinidad de coocurrencias regularizadas
 *  5. ensemble ponderado por el desempeño fuera de muestra de cada estrategia
 *     (softmax de sus métricas internas; NO es aleatorio ni un bloque fijo)
 *
 * Construcción: función de puntuación + penalización controlada de
 * solapamiento entre jugadas (sin bloques rígidos, sin descartar números
 * buenos por reglas arbitrarias). 100 % determinista (sin RNG): misma
 * entrada → misma salida.
 *
 * HONESTIDAD: si el backtest no demuestra ventaja sobre el azar, las jugadas
 * se etiquetan como "selecciones heurísticas basadas en historial, sin
 * ventaja demostrada". En un sorteo justo todas las combinaciones tienen la
 * misma probabilidad matemática.
 */

import { createHash } from "crypto"
import {
  calcularMotor,
  probabilidadesTeoricas,
  VERSION_MOTOR,
  type MotorEstadistico,
  type SorteoValidado,
} from "./estadisticas"

export const VERSION_ALGORITMO = "pf-combinaciones-1.0.0"

export interface SenalNumero {
  numero: string // "07"
  frecHist: number
  frecReciente: number
  desviacion: number
  incertidumbre: string
  afinidadCooc: number
}

export interface Jugada {
  orden: number
  estrategia: string
  numeros: number[]
  explicacion: string
  senales: SenalNumero[]
}

export interface GeneracionCombinaciones {
  version: string
  versionMotor: string
  generadoEn: string
  historial: {
    cantidad: number
    desde: string
    hasta: string
    huella: string
    entrenamientoSplit?: { train: number; validacion: number }
  }
  jugadas: Jugada[]
  etiqueta: string
  ventajaDemostrada: boolean | null
  probabilidadesTeoricas: {
    alMenos6: number
    alMenos7: number
    alMenos8: number
    exactamente8: number
    nota: string
  }
  advertencias: string[]
  meta: Record<string, unknown>
}

const NOTA_PROB =
  "Probabilidades matemáticas de un sorteo justo e independiente para una jugada de 8 " +
  "números contra un extracto oficial de 20 sobre 100 (hipergeométrica). No dependen del modelo."

const ETIQUETA_HEURISTICA =
  "Selecciones heurísticas basadas en el historial oficial validado · sin ventaja demostrada sobre el azar"

export function huellaHistorial(sorteos: SorteoValidado[]): string {
  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.concurso - b.concurso
  )
  return createHash("sha256")
    .update(ordenados.map((s) => `${s.concurso}:${s.fecha}`).join("|"))
    .digest("hex")
    .slice(0, 16)
}

function z(valores: number[]): number[] {
  const m = valores.reduce((a, b) => a + b, 0) / (valores.length || 1)
  const v = valores.reduce((a, b) => a + (b - m) ** 2, 0) / (valores.length || 1)
  const sd = Math.sqrt(v)
  if (!sd) return valores.map(() => 0)
  return valores.map((x) => (x - m) / sd)
}

function puntajeHistRegularizado(motor: MotorEstadistico, k: number): number[] {
  const n = motor.muestra
  return motor.porNumero.map((s) => (s.apariciones + k * 0.2) / (n + k))
}

function puntajeReciente(motor: MotorEstadistico): number[] {
  return motor.porNumero.map((s) => s.frecuenciaPonderada)
}

interface SplitOos {
  train: SorteoValidado[]
  validacion: SorteoValidado[]
}

function splitCronologico(sorteos: SorteoValidado[]): SplitOos | null {
  if (sorteos.length < 40) return null
  const corte = Math.floor(sorteos.length * 0.8)
  if (corte < 20 || sorteos.length - corte < 8) return null
  return { train: sorteos.slice(0, corte), validacion: sorteos.slice(corte) }
}

/** Métrica fuera de muestra: promedio del z-score de los números realmente extraídos. */
function metricaOos(puntajes: number[], validacion: SorteoValidado[]): number {
  const zz = z(puntajes)
  const valores: number[] = []
  for (const s of validacion) {
    for (const num of s.numeros) valores.push(zz[num] ?? 0)
  }
  return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0
}

const GRILLA_HALFLIFE = [30, 60, 120] as const
const GRILLA_K = [10, 20, 40] as const

/** Estrategia 3 + métricas OOS de todas (selección estrictamente cronológica). */
function evaluarEstrategiasOos(
  sorteos: SorteoValidado[],
  motorFull: MotorEstadistico
): {
  split: SplitOos | null
  elegido: { halflife: number; k: number; metrica: number }
  metricas: Record<string, number>
} {
  const split = splitCronologico(sorteos)
  if (!split) {
    return {
      split: null,
      elegido: { halflife: 60, k: 20, metrica: NaN },
      metricas: { estrategia1: NaN, estrategia2: NaN, estrategia3: NaN, estrategia4: NaN },
    }
  }
  const motorTrain = calcularMotor(split.train, {
    halflifeSorteos: motorFull.halflifeSorteos,
    bins: motorFull.bins,
    ventanaReciente: motorFull.ventanaReciente,
  })

  let mejor = { halflife: 60, k: 20, metrica: -Infinity }
  for (const h of GRILLA_HALFLIFE) {
    const mH = calcularMotor(split.train, { halflifeSorteos: h })
    const pRec = puntajeReciente(mH)
    for (const k of GRILLA_K) {
      const pHist = puntajeHistRegularizado(mH, k)
      const combinado = z(pHist).map((v, i) => 0.5 * v + 0.5 * z(pRec)[i])
      const met = metricaOos(combinado, split.validacion)
      if (met > mejor.metrica) mejor = { halflife: h, k, metrica: met }
    }
  }

  const pHist1 = puntajeHistRegularizado(motorTrain, 20)
  const pRec2 = puntajeReciente(motorTrain)
  const mElegido = calcularMotor(split.train, { halflifeSorteos: mejor.halflife })
  const pTrend = puntajeReciente(mElegido)
  const pCom4 = z(pHist1).map((v, i) => 0.5 * v + 0.5 * z(pRec2)[i])

  return {
    split,
    elegido: mejor,
    metricas: {
      estrategia1: metricaOos(pHist1, split.validacion),
      estrategia2: metricaOos(pRec2, split.validacion),
      estrategia3: metricaOos(pTrend, split.validacion),
      estrategia4: metricaOos(pCom4, split.validacion),
    },
  }
}

function softmax(vals: number[], beta = 6): number[] {
  const finite = vals.every((v) => Number.isFinite(v))
  if (!finite) return vals.map(() => 1 / vals.length)
  const max = Math.max(...vals)
  const ex = vals.map((v) => Math.exp((v - max) * beta))
  const s = ex.reduce((a, b) => a + b, 0)
  return ex.map((e) => e / s)
}

/**
 * Construye una jugada de 8 números a partir de un ranking, con afinidad de
 * coocurrencias (gamma) y penalización de solapamiento contra jugadas previas
 * (beta). Determinista: los empates los resuelve el número menor.
 */
function construirJugada(
  puntajes: number[],
  cooc: number[][],
  previas: number[][],
  gamma: number,
  beta: number
): number[] {
  const elegidos: number[] = []
  const disponibles = new Set(Array.from({ length: 100 }, (_, i) => i))
  for (let paso = 0; paso < 8; paso++) {
    let mejorNum = -1
    let mejorVal = -Infinity
    for (const num of disponibles) {
      let v = puntajes[num]
      if (gamma > 0 && elegidos.length > 0) {
        let suma = 0
        for (const e of elegidos) suma += cooc[num][e]
        v += gamma * (suma / elegidos.length)
      }
      if (previas.length > 0 && beta > 0) {
        let veces = 0
        for (const p of previas) if (p.includes(num)) veces++
        v -= beta * (veces / previas.length)
      }
      if (v > mejorVal || (v === mejorVal && (mejorNum < 0 || num < mejorNum))) {
        mejorVal = v
        mejorNum = num
      }
    }
    elegidos.push(mejorNum)
    disponibles.delete(mejorNum)
  }
  return elegidos.sort((a, b) => a - b)
}

function duplicadasEntre(jugadas: number[][]): boolean {
  for (let i = 0; i < jugadas.length; i++) {
    for (let j = i + 1; j < jugadas.length; j++) {
      if (jugadas[i].some((n) => jugadas[j].includes(n))) return true
    }
  }
  return false
}

function senalesPara(motor: MotorEstadistico, nums: number[], usarCooc: boolean): SenalNumero[] {
  return nums.map((n) => {
    const s = motor.porNumero[n]
    return {
      numero: String(n).padStart(2, "0"),
      frecHist: Number(s.frecuenciaHistorica.toFixed(4)),
      frecReciente: Number(s.frecuenciaReciente.toFixed(4)),
      desviacion: Number(s.desviacionVsTeorica.toFixed(4)),
      incertidumbre: s.incertidumbre,
      afinidadCooc: usarCooc
        ? Number(
            (s.coocurrencia.reduce((a, b) => a + b, 0) / 100).toFixed(4)
          )
        : 0,
    }
  })
}

const EXPLICACIONES: Record<string, string> = {
  "1-frecuencia-historica":
    "Frecuencias sobre todo el historial validado, regularizadas hacia el 20 % teórico (evita sobreajustar rarezas).",
  "2-frecuencia-reciente":
    "Frecuencia ponderada exponencialmente: los sorteos recientes pesan más, sin descartar el historial completo.",
  "3-tendencias-validadas":
    "Tendencia temporal cuyo hiperparámetro se eligió con validación fuera de muestra cronológica (80/20 interno).",
  "4-combinado-coocurrencias":
    "Frecuencia + recencia combinadas, con afinidad de coocurrencias regularizadas entre los 8 números.",
  "5-ensemble-oos":
    "Ensemble de las estrategias con mejor desempeño fuera de muestra (pesos softmax de sus métricas internas).",
}

export interface OpcionesGeneracion {
  generadoEn?: Date
  gammaCooc?: number
  betaBase?: number
}

export function generarCombinaciones(
  sorteos: SorteoValidado[],
  opts: OpcionesGeneracion = {}
): GeneracionCombinaciones {
  const ahora = opts.generadoEn ?? new Date()
  const motor = calcularMotor(sorteos)
  const oos = evaluarEstrategiasOos(sorteos, motor)

  // Rankings de las 5 estrategias sobre TODOS los datos (el split sólo eligió
  // hiperparámetros/pesos; jamás se usó el sorteo a evaluar).
  const s1 = z(puntajeHistRegularizado(motor, 20))
  const s2 = z(puntajeReciente(motor))
  const m3 = calcularMotor(sorteos, { halflifeSorteos: oos.elegido.halflife })
  const s3 = z(puntajeReciente(m3))
  const s4 = z(puntajeHistRegularizado(motor, oos.elegido.k)).map(
    (v, i) => 0.5 * v + 0.5 * z(puntajeReciente(motor))[i]
  )
  const w = softmax([
    oos.metricas.estrategia1,
    oos.metricas.estrategia2,
    oos.metricas.estrategia3,
    oos.metricas.estrategia4,
  ])
  const s5 = z(
    s1.map((v, i) => w[0] * v + w[1] * s2[i] + w[2] * s3[i] + w[3] * s4[i])
  )

  const ordenEstrategias: { id: string; scores: number[]; gamma: number }[] = [
    { id: "1-frecuencia-historica", scores: s1, gamma: 0 },
    { id: "2-frecuencia-reciente", scores: s2, gamma: 0 },
    { id: "3-tendencias-validadas", scores: s3, gamma: 0 },
    { id: "4-combinado-coocurrencias", scores: s4, gamma: opts.gammaCooc ?? 0.05 },
    { id: "5-ensemble-oos", scores: s5, gamma: opts.gammaCooc ?? 0.05 },
  ]

  const cooc = motor.porNumero.map((s) => s.coocurrencia)
  let beta = opts.betaBase ?? 0.12
  let jugadasNums: number[][] = []
  for (let intento = 0; intento < 6; intento++) {
    jugadasNums = []
    for (const e of ordenEstrategias) {
      jugadasNums.push(construirJugada(e.scores, cooc, jugadasNums, e.gamma, beta))
    }
    if (!duplicadasEntre(jugadasNums)) break
    beta *= 1.6
  }

  const jugadas: Jugada[] = jugadasNums.map((nums, i) => ({
    orden: i + 1,
    estrategia: ordenEstrategias[i].id,
    numeros: nums,
    explicacion: EXPLICACIONES[ordenEstrategias[i].id],
    senales: senalesPara(motor, nums, ordenEstrategias[i].gamma > 0),
  }))

  const advertencias = [
    "Las frecuencias históricas no implican mayor probabilidad futura: cada sorteo es independiente.",
    "Ventaja sobre el azar sólo si el backtest walk-forward lo demuestra con evidencia suficiente.",
  ]
  if (motor.muestra < 120) {
    advertencias.unshift(
      `Experimental: sólo ${motor.muestra} sorteos validados en el historial (muestra corta).`
    )
  }
  if (oos.split) {
    advertencias.push(
      `Selección interna de hiperparámetros: train ${oos.split.train.length} / validación ${oos.split.validacion.length} (cronológico).`
    )
  } else {
    advertencias.push(
      "Historial insuficiente para validación fuera de muestra interna: se usan parámetros fijos documentados."
    )
  }

  return {
    version: VERSION_ALGORITMO,
    versionMotor: VERSION_MOTOR,
    generadoEn: ahora.toISOString(),
    historial: {
      cantidad: motor.muestra,
      desde: motor.desde,
      hasta: motor.hasta,
      huella: huellaHistorial(sorteos),
      entrenamientoSplit: oos.split
        ? { train: oos.split.train.length, validacion: oos.split.validacion.length }
        : undefined,
    },
    jugadas,
    etiqueta: ETIQUETA_HEURISTICA,
    ventajaDemostrada: null, // lo decide el backtest con evidencia
    probabilidadesTeoricas: {
      ...probabilidadesTeoricas(),
      nota: NOTA_PROB,
    },
    advertencias,
    meta: {
      halflifeElegido: oos.elegido.halflife,
      kElegido: oos.elegido.k,
      metricaOosElegida: Number.isFinite(oos.elegido.metrica) ? Number(oos.elegido.metrica.toFixed(5)) : null,
      metricasOos: Object.fromEntries(
        Object.entries(oos.metricas).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(5)) : null])
      ),
      pesosEnsemble: w.map((x) => Number(x.toFixed(4))),
      betaSolapamiento: Number(beta.toFixed(3)),
      grilla: { halflife: GRILLA_HALFLIFE, k: GRILLA_K },
    },
  }
}
