/**
 * Métricas por objetivo (2/3/4 cifras) del meta-selector.
 *
 * Criterios de acierto — SIEMPRE los de `lib/verificacion/criterio.ts` y la
 * RPC oficial `verify_predictions_for_draw`, nunca inventados:
 *  - 2 cifras: la CABEZA (`numbers[0] % 100`) ∈ tus picks de 2 cifras
 *    (criterio WON real; ±1 = near-miss). También se mide la intersección
 *    top-K con los 20 distintos (20 puestos) y el rank de la cabeza.
 *  - 3 y 4 cifras: el pick coincide con CUALQUIERA de los 20 puestos
 *    (`MOD(n, 1000)` / `MOD(n, 10000)`), vía `deriveNums`.
 *
 * Los ceros iniciales se conservan ("00", "007", "0031") — las derivaciones
 * usan `padStart` exactamente como el verificador oficial.
 */

import { deriveNums } from "@/lib/verificacion/criterio"
import { dosCifras } from "./candidatos"
import type { SorteoSelector } from "./tipos"

/** Top-K (k primeros) de un ranking 00-99. */
export function topK(ranking: number[], k: number): number[] {
  return ranking.slice(0, k)
}

/** Métricas de 2 cifras de un ranking contra un sorteo. */
export function metrica2C(
  ranking: number[],
  sorteo: SorteoSelector,
  k: number
): { cabezaEnTopK: boolean; hits2C: number; rankCabeza: number; mrr: number } {
  const top = topK(ranking, k)
  const distintos2C = new Set(sorteo.numbers.map(dosCifras))
  let hits2C = 0
  for (const n of top) if (distintos2C.has(n)) hits2C++
  const cabeza = dosCifras(sorteo.numbers[0])
  const rank = ranking.indexOf(cabeza) + 1 // 1..100 (ranking completo)
  return {
    cabezaEnTopK: rank <= k,
    hits2C,
    rankCabeza: rank,
    mrr: 1 / rank,
  }
}

/**
 * Puntaje de un candidato de 3/4 cifras según un baseline puro: frecuencia
 * (o recencia) de su representación de `cifras` dígitos en el historial.
 * Sólo aplica si el candidato es un número de ese espacio (0..10^cifras-1).
 */
export function puntuarCandidatoPuro(
  candidato: number,
  historial: SorteoSelector[],
  cifras: 2 | 3 | 4,
  modo: "frecuencia" | "recencia" | "bayes",
  halfLife = 15
): number {
  const mod = cifras === 2 ? 100 : cifras === 3 ? 1000 : 10000
  const lambda = Math.LN2 / halfLife
  const n = historial.length
  let s = 0
  for (let i = 0; i < n; i++) {
    const w = modo === "recencia" ? Math.exp(-lambda * (n - 1 - i)) : 1
    for (const num of historial[i].numbers) {
      if (num % mod === candidato % mod) s += w
    }
  }
  if (modo === "bayes") {
    // Suavizado Beta con prior 1/mod (media de un uniforme sobre el espacio)
    const prior = 1 / mod
    const fuerza = 20
    return (s + fuerza * prior) / (n + fuerza)
  }
  return s
}

/**
 * Blend genérico escala-invariante (misma semántica que `blendEngines` /
 * `blendCandidatos` del pipeline: cada motor se divide por SU máximo antes de
 * ponderar, porque las escalas internas no son comparables).
 *
 * @param porMotor nombre → (candidato → score bruto del motor)
 * @param pesos normalizados (suman 1)
 */
export function blendGenerico(
  candidatos: number[],
  porMotor: Record<string, (c: number) => number>,
  pesos: Record<string, number>
): number[] {
  const nombres = Object.keys(porMotor)
  const maximos: Record<string, number> = {}
  for (const m of nombres) {
    maximos[m] = Math.max(...candidatos.map((c) => porMotor[m](c)), Number.EPSILON)
  }
  const scored = candidatos.map((c) => {
    let acc = 0
    for (const m of nombres) {
      const w = pesos[m] ?? 0
      if (w <= 0) continue
      acc += w * (porMotor[m](c) / maximos[m])
    }
    return [c, acc] as [number, number]
  })
  scored.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return scored.map((x) => x[0])
}

/** ¿Alguno de los picks (top-K) de 3/4 cifras cae en algún puesto del sorteo? */
export function aciertoEn20Puestos(
  picks: number[],
  sorteo: SorteoSelector,
  cifras: 3 | 4
): boolean {
  const derivados = deriveNums(sorteo.numbers, false)
  const set = new Set(cifras === 3 ? derivados.nums3 : derivados.nums4)
  for (const p of picks) {
    if (set.has(String(p % 10 ** cifras).padStart(cifras, "0"))) return true
  }
  return false
}

/** Solape de los top-K de dos rankings (0..1). */
export function solapeTopK(a: number[], b: number[], k: number): number {
  const sa = new Set(a.slice(0, k))
  let inter = 0
  for (const n of b.slice(0, k)) if (sa.has(n)) inter++
  return k > 0 ? inter / k : 0
}

/** Correlación de Spearman entre dos rankings completos (posiciones 1..100). */
export function spearman(rankingA: number[], rankingB: number[]): number {
  const n = Math.min(rankingA.length, rankingB.length)
  if (n < 2) return 0
  const posA = new Array<number>(n)
  const posB = new Array<number>(n)
  rankingA.forEach((num, i) => {
    posA[num] = i + 1
  })
  rankingB.forEach((num, i) => {
    posB[num] = i + 1
  })
  let d2 = 0
  for (let num = 0; num < n; num++) {
    const d = (posA[num] ?? 0) - (posB[num] ?? 0)
    d2 += d * d
  }
  return 1 - (6 * d2) / (n * (n * n - 1))
}

/** Agrega métricas 2C por sorteo en un período. */
export function agregarMetricas2C(
  filas: { cabezaEnTopK: boolean; hits2C: number; rankCabeza: number; mrr: number }[]
): { n: number; cabezaEnTopK: number; mediaHits2C: number; rankCabezaMedio: number; mrr: number } {
  const n = filas.length
  if (n === 0) return { n: 0, cabezaEnTopK: 0, mediaHits2C: 0, rankCabezaMedio: 0, mrr: 0 }
  const sum = (f: (x: (typeof filas)[0]) => number) => filas.reduce((a, x) => a + f(x), 0)
  return {
    n,
    cabezaEnTopK: sum((f) => (f.cabezaEnTopK ? 1 : 0)) / n,
    mediaHits2C: sum((f) => f.hits2C) / n,
    rankCabezaMedio: sum((f) => f.rankCabeza) / n,
    mrr: sum((f) => f.mrr) / n,
  }
}
