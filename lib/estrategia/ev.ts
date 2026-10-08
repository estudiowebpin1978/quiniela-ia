/**
 * Calculadora de Valor Esperado (EV) — matemática pura, sin I/O.
 *
 * EV de una apuesta = Σ_i P(resultado_i) × premio_i − costo_total
 *
 * REGLA DE HONESTIDAD: los premios y el costo NO se inventan aquí. Son datos
 * OFICIALES de LOTBA (fuente primaria) que se pasan como `PremioModalidad`.
 * Si falta algún premio (`premio == null`), el EV es `null` (fail-closed) —
 * jamás se rellena con un número inventado.
 *
 * Las probabilidades `pGanar` provienen de `lib/estrategia/probabilidades.ts`
 * (exactas, azar puro). Nota: casi siempre el EV de lotería es NEGATIVO —
 * eso es el resultado honesto, no un bug. El módulo existe para mostrar cuánto
 * se pierde en promedio por peso y comparar modalidades, no para prometer ganancia.
 */

import type { JuegoConfig } from "./probabilidades"
import { pCoincidenciaMod, pCabezaMod, pPoceada } from "./probabilidades"

/** Una modalidad de apuesta con su premio oficial (o null si falta). */
export interface PremioModalidad {
  /** Nombre de la modalidad ("2 cifras", "redoblona", "poceada ≥5", ...) */
  modalidad: string
  /** Cantidad de números que elegís */
  kPicks: number
  /** Probabilidad EXACTA de ganar (de probabilidades.ts) */
  pGanar: number
  /** Pago del premio en pesos por la apuesta base (ej.: premio en $). null = falta dato oficial */
  premio: number | null
  /** Costo de la apuesta en pesos. null = falta dato oficial */
  costo: number | null
  /** Premios adicionales opcionales (otras categorías) */
  otrosPremios?: { categoria: string; prob: number; premio: number }[]
}

export interface ResultadoEV {
  modalidad: string
  pGanar: number
  /** Ganancia neta esperada por apuesta (pesos). Negativo = pérdida esperada. */
  ev: number | null
  /** EV como fracción del costo (−0.5 = perdés 50% en promedio) */
  evPct: number | null
  /** ¿Se pudo calcular? false si faltó premio/costo oficial */
  calculable: boolean
  motivoNoCalculable?: string
}

/**
 * EV neto (ganancia − costo) de una modalidad. Fail-closed: si falta premio o
 * costo oficial, devuelve `ev: null` y `calculable: false`.
 */
export function calcularEV(m: PremioModalidad): ResultadoEV {
  const base = { modalidad: m.modalidad, pGanar: m.pGanar }

  if (m.premio == null || m.costo == null) {
    return {
      ...base,
      ev: null,
      evPct: null,
      calculable: false,
      motivoNoCalculable:
        "Falta premio y/o costo oficial de LOTBA (no se inventa).",
    }
  }

  // EV = pGanar × premio + Σ otrosPremios − costo
  let ev = m.pGanar * m.premio
  for (const o of m.otrosPremios ?? []) ev += o.prob * o.premio
  ev -= m.costo

  return {
    ...base,
    ev,
    evPct: m.costo > 0 ? ev / m.costo : null,
    calculable: true,
  }
}

/**
 * Probabilidad de ganar de una modalidad, derivada de las reglas exactas.
 * `criterio`:
 *   - "coincidencia" → ≥1 de tus K clases mod-M entre los 20 sorteados
 *   - "cabeza"       → la cabeza (1er sorteado) cae en tus K picks (estricto)
 *   - "poceada"      → ≥ umbral aciertos de tus K números
 */
export function probabilidadModalidad(
  juego: JuegoConfig,
  tipo: "coincidencia" | "cabeza" | "poceada",
  kPicks: number,
  opts?: { modM?: number; umbral?: number },
): number {
  switch (tipo) {
    case "coincidencia":
      return pCoincidenciaMod(juego, kPicks, opts?.modM ?? 100)
    case "cabeza":
      return pCabezaMod(juego, kPicks, opts?.modM ?? 100)
    case "poceada":
      return pPoceada(juego, kPicks, opts?.umbral ?? 5)
  }
}

/**
 * Comparador honesto: ordena modalidades por EV (mayor primero) y marca las
 * negativas. Solo incluye las calculables; las no calculables se listan aparte
 * con su motivo, para no ocultar que faltan datos oficiales.
 */
export function compararEV(modalidades: PremioModalidad[]): {
  calculables: ResultadoEV[]
  pendientesDePremios: ResultadoEV[]
  mejor: ResultadoEV | null
  todasNegativas: boolean
} {
  const resultados = modalidades.map(calcularEV)
  const calculables = resultados
    .filter((r) => r.calculable && r.ev != null)
    .sort((a, b) => (b.ev ?? -Infinity) - (a.ev ?? -Infinity))
  const pendientes = resultados.filter((r) => !r.calculable)
  return {
    calculables,
    pendientesDePremios: pendientes,
    mejor: calculables[0] ?? null,
    todasNegativas: calculables.length > 0 && calculables.every((r) => (r.ev ?? 0) < 0),
  }
}
