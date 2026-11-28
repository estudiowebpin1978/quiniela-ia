/**
 * Utilidades estadísticas compartidas de backtesting.
 *
 * Las usa el selector walk-forward (`lib/selector`) para el baseline aleatorio,
 * la permutación pareada y el veto de holdout.
 */

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

export interface HoldoutBacktest {
  evaluaciones: number
  desde: string
  hasta: string
  diferencia: number
  intervalo95: [number, number]
  /** true si el IC del período reservado queda completamente por debajo de 0. */
  contradice: boolean
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
