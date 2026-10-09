/**
 * Backtest walk-forward del Brinco — evaluación honesta contra el azar.
 *
 * Metodología estrictamente cronológica (sin fuga de información):
 *  1. Para cada concurso i (tras un calentamiento warmup), se usa SOLO la
 *     historia de sorteos anteriores (0..i-1) para generar una jugada.
 *  2. Se comparan los aciertos de esa jugada contra el resultado oficial del
 *     concurso i, por separado para Tradicional y Junior.
 *  3. Se compara contra la línea base del AZAR: la distribución hipergeométrica
 *     exacta de elegir 6 de 40 (esperanza 0,9 aciertos) y una línea base
 *     aleatoria empírica semillada.
 *
 * Se informa tamaño de muestra, métricas e incertidumbre. NO se promete ventaja:
 * en un sorteo justo ninguna selección mejora la probabilidad teórica. Si la
 * muestra es chica, se dice explícitamente.
 */

import { createRng, hashSeed } from "@/lib/math/seeded-rng"
import {
  BRINCO_NUMEROS_POR_JUGADA,
  BRINCO_TOTAL_BOLILLAS,
  BRINCO_COMBINACIONES,
  contarAciertos,
  distribucionAzar,
  esperanzaAzar,
} from "@/lib/brinco/reglas"
import {
  generarPrediccionBrinco,
  type ModalidadBrinco,
} from "@/lib/brinco/motor"

export interface SorteoBrinco {
  concurso: number
  fecha: string
  tradicional: number[]
  junior: number[] | null
}

export interface ResultadoBacktest {
  modalidad: ModalidadBrinco
  muestras: number // sorteos evaluados
  warmup: number
  distribucion: number[] // frecuencia observada de 0..6 aciertos (índice = aciertos)
  mediaAciertos: number
  esperanzaAzar: number // 0.9
  desvAzar: number
  z: number // (media - esperanza) / SE
  pAlMenos1: number
  pAlMenos3: number
  pAlMenos4: number
  pAlMenos5: number
  pExactamente6: number
  mediaAzarEmpirica: number // baseline aleatoria semillada (empírica)
  significativo: boolean // |z| >= 1.96
  limitacion: string
}

export interface BacktestReport {
  brinco: string
  combinacionesPosibles: number
  tradicional: ResultadoBacktest | null
  junior: ResultadoBacktest | null
  advertencia: string
}

const DESV_AZAR = (() => {
  // Var hipergeométrica: n·(K/N)·((N−K)/N)·((N−n)/(N−1)), N=40, K=6, n=6
  const N = BRINCO_TOTAL_BOLILLAS
  const K = BRINCO_NUMEROS_POR_JUGADA
  const n = BRINCO_NUMEROS_POR_JUGADA
  const varianza = n * (K / N) * ((N - K) / N) * ((N - n) / (N - 1))
  return Math.sqrt(varianza)
})()

function evaluarModalidad(
  modalidad: ModalidadBrinco,
  sorteos: SorteoBrinco[],
  warmup: number,
): ResultadoBacktest | null {
  // Serie cronológica de la modalidad (Junior solo donde existe).
  const serie = sorteos
    .map((s) => ({
      concurso: s.concurso,
      objetivo: modalidad === "tradicional" ? s.tradicional : s.junior,
    }))
    .filter((x): x is { concurso: number; objetivo: number[] } => Array.isArray(x.objetivo))

  if (serie.length <= warmup + 1) return null

  const distribucion = new Array<number>(BRINCO_NUMEROS_POR_JUGADA + 1).fill(0)
  let suma = 0
  let sumaAzar = 0
  const rng = createRng(hashSeed("brinco-baseline", modalidad))

  for (let i = warmup; i < serie.length; i++) {
    const objetivo = serie[i].objetivo
    const hist = serie.slice(0, i).map((x) => x.objetivo)
    const pred = generarPrediccionBrinco(
      modalidad,
      hist,
      { semilla: hashSeed("brinco-oos", modalidad, serie[i].concurso), candidatos: 300, alternativas: 0 },
      null,
    )
    const hits = contarAciertos(pred.combinacion, objetivo)
    distribucion[hits]++
    suma += hits

    // Línea base aleatoria empírica (6 distintos de 0..39) semillada.
    const pool = Array.from({ length: BRINCO_TOTAL_BOLILLAS }, (_, k) => k)
    const randomPick: number[] = []
    while (randomPick.length < BRINCO_NUMEROS_POR_JUGADA) {
      const idx = Math.floor(rng() * pool.length)
      randomPick.push(pool[idx])
      pool.splice(idx, 1)
    }
    sumaAzar += contarAciertos(randomPick, objetivo)
  }

  const m = serie.length - warmup
  const media = suma / m
  const mediaAzar = sumaAzar / m
  const se = DESV_AZAR / Math.sqrt(m)
  const z = se > 0 ? (media - esperanzaAzar()) / se : 0

  const prob = (k: number) => distribucion[k] / m
  let acum3 = 0,
    acum4 = 0,
    acum5 = 0
  for (let k = 3; k <= 6; k++) acum3 += distribucion[k]
  for (let k = 4; k <= 6; k++) acum4 += distribucion[k]
  for (let k = 5; k <= 6; k++) acum5 += distribucion[k]

  return {
    modalidad,
    muestras: m,
    warmup,
    distribucion,
    mediaAciertos: media,
    esperanzaAzar: esperanzaAzar(),
    desvAzar: DESV_AZAR,
    z,
    pAlMenos1: 1 - prob(0),
    pAlMenos3: acum3 / m,
    pAlMenos4: acum4 / m,
    pAlMenos5: acum5 / m,
    pExactamente6: prob(6),
    mediaAzarEmpirica: mediaAzar,
    significativo: Math.abs(z) >= 1.96,
    limitacion:
      m < 100
        ? `Muestra pequeña (n=${m}): no permite concluir ventaja estadística.`
        : `Muestra n=${m}.`,
  }
}

export function backtestBrinco(sorteos: SorteoBrinco[], warmup = 10): BacktestReport {
  const ordenados = [...sorteos].sort((a, b) => a.concurso - b.concurso)
  const trad = evaluarModalidad("tradicional", ordenados, warmup)
  const jr = evaluarModalidad("junior", ordenados, warmup)
  const esperada = distribucionAzar()

  return {
    brinco: `Brinco (6 de ${BRINCO_TOTAL_BOLILLAS}, ${BRINCO_COMBINACIONES.toLocaleString("es-AR")} combinaciones)`,
    combinacionesPosibles: BRINCO_COMBINACIONES,
    tradicional: trad,
    junior: jr,
    advertencia:
      "Sorteo justo: ninguna selección supera la probabilidad teórica de acertar (1/" +
      `${BRINCO_COMBINACIONES.toLocaleString("es-AR")}). La distribución esperada del azar es ` +
      `hipergeométrica (media ${esperanzaAzar().toFixed(2)} aciertos). ` +
      "El Brinco es poceado: el valor real a optimizar es la división del pozo, no la probabilidad.",
  }
}

/** Distribución teórica del azar (para mostrar en el informe/UI). */
export function distribucionAzarBrinco(): number[] {
  return distribucionAzar()
}
