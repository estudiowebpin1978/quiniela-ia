/**
 * Pesos del meta-selector — ajuste SÓLO con validación cronológica interna.
 *
 * Reglas (pliego):
 *  - Los pesos se estiman con el rendimiento fuera de muestra de los
 *    candidatos en las ventanas de VALIDACIÓN, que viven dentro del período
 *    de entrenamiento y son estrictamente anteriores al holdout final.
 *  - Shrinkage hacia el prior uniforme (lambda), softmax con temperatura
 *    acotada (beta) y clamp [pesoMin, pesoMax]: un sorteo suelto no puede
 *    voltear los pesos.
 *  - Sin muestra suficiente → pesos de referencia (uniformes) y `experimental`.
 *  - Nunca se usan los resultados del período reservado para fijar pesos.
 */

import type { PesosSelector } from "./tipos"

export const REFERENCIA_PESOS = {
  lambda: 0.3, // 30 % de masa reservada al prior uniforme
  beta: 1.5, // temperatura del softmax (mayor = más concentrado)
  pesoMin: 0.05, // piso por candidato
  pesoMax: 0.5, // techo por candidato
  minValid: 30, // cortes mínimos de validación interna
} as const

export interface OpcionesPesos {
  lambda?: number
  beta?: number
  pesoMin?: number
  pesoMax?: number
  minValid?: number
  /** Nombres que DEBEN estar presentes aunque no tengan datos (fuerza prior). */
  candidatosEsperados?: string[]
}

/**
 * Ajusta los pesos a partir de las métricas por corte de validación interna.
 * `series` mapea nombre de candidato → métricas por corte (alineadas en el
 * tiempo entre candidatos; si un candidato no tiene serie se excluye y se
 * informa).
 */
export function ajustarPesos(
  series: Record<string, number[]>,
  opts: OpcionesPesos = {}
): PesosSelector {
  const lambda = opts.lambda ?? REFERENCIA_PESOS.lambda
  const beta = opts.beta ?? REFERENCIA_PESOS.beta
  const pesoMin = opts.pesoMin ?? REFERENCIA_PESOS.pesoMin
  const pesoMax = opts.pesoMax ?? REFERENCIA_PESOS.pesoMax
  const minValid = opts.minValid ?? REFERENCIA_PESOS.minValid
  const regularizacion = { lambda, beta, pesoMin, pesoMax }

  const nombres = Object.keys(series).sort()
  const esperados = (opts.candidatosEsperados ?? nombres).slice().sort()
  const universo = [...new Set([...esperados, ...nombres])]

  const nValid = nombres.length
    ? Math.min(...nombres.map((nm) => series[nm].length))
    : 0

  const uniforme = (): Record<string, number> => {
    const p: Record<string, number> = {}
    const k = Math.max(1, universo.length)
    for (const nm of universo) p[nm] = 1 / k
    return p
  }

  if (nValid < minValid) {
    return {
      pesos: uniforme(),
      experimental: true,
      metodo: "referencia",
      nValid,
      regularizacion,
    }
  }

  // Media por candidato sobre sus nValid cortes comunes.
  const medias: Record<string, number> = {}
  for (const nm of nombres) {
    const s = series[nm].slice(0, nValid)
    medias[nm] = s.reduce((a, b) => a + b, 0) / s.length
  }
  const vals = Object.values(medias)
  const media = vals.reduce((a, b) => a + b, 0) / vals.length
  const varianza =
    vals.length > 1 ? vals.reduce((a, b) => a + (b - media) ** 2, 0) / (vals.length - 1) : 0
  const sd = Math.sqrt(varianza)

  // θ estandarizado (z interno); sin dispersión → prior puro.
  const pesos: Record<string, number> = {}
  const k = universo.length
  const prior = 1 / k
  if (sd <= 1e-12) {
    for (const nm of universo) pesos[nm] = prior
  } else {
    // Softmax con temperatura acotada sobre θ estandarizado (sólo entre los
    // candidatos con serie; los demás quedan en 0 y cobran el prior abajo).
    const zetas = nombres.map((nm) => (medias[nm] - media) / sd)
    const maxZ = Math.max(...zetas.map((z) => beta * z))
    const exponenciales = zetas.map((z) => Math.exp(beta * z - maxZ))
    const sumaExp = exponenciales.reduce((a, b) => a + b, 0)
    for (const nm of universo) pesos[nm] = 0
    nombres.forEach((nm, i) => {
      pesos[nm] = exponenciales[i] / sumaExp
    })
  }

  // Shrinkaje hacia el prior uniforme + clamp + renormalización final.
  for (const nm of universo) {
    const mezcla = (1 - lambda) * (pesos[nm] ?? 0) + lambda * prior
    pesos[nm] = Math.min(pesoMax, Math.max(pesoMin, mezcla))
  }
  const total = Object.values(pesos).reduce((a, b) => a + b, 0)
  for (const nm of universo) pesos[nm] = pesos[nm] / total

  return {
    pesos,
    experimental: false,
    metodo: "validacion_cronologica_interna",
    nValid,
    regularizacion,
  }
}

/** Cambio máximo (en valor absoluto) de cualquier peso tras perturbar una métrica. */
export function sensibilidadMaxima(
  series: Record<string, number[]>,
  nombre: string,
  delta: number,
  opts: OpcionesPesos = {}
): number {
  const base = ajustarPesos(series, opts).pesos
  const perturbado: Record<string, number[]> = {}
  for (const [nm, s] of Object.entries(series)) perturbado[nm] = [...s]
  if (!perturbado[nombre] || perturbado[nombre].length === 0) return 0
  perturbado[nombre][perturbado[nombre].length - 1] += delta
  const otro = ajustarPesos(perturbado, opts).pesos
  let max = 0
  for (const nm of Object.keys(base)) {
    const d = Math.abs((base[nm] ?? 0) - (otro[nm] ?? 0))
    if (d > max) max = d
  }
  return max
}
