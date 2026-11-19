/**
 * Estadística histórica para un conjunto concreto de pares de 2 cifras.
 * Función pura sobre el historial oficial `draws`: dados K pares (p.ej. los 5 del
 * Plan Operativo de 5 Redoblonas), cuenta en cuántos sorteos aparecen ambos
 * números de cada par, y devuelve la distribución de cuántos pares se
 * completan "a la vez" en un mismo extracto.
 *
 * Determinista. Sin red. Sin simulación: puro conteo sobre datos oficiales.
 * describe el pasado — no garantiza el futuro.
 */

export interface ParesStatsRow {
  a: number
  b: number
  label: string
  frecuencia: number
  /** P(ambos presentes) = frecuencia / muestra. */
  probConjunta: number
  /** probConjunta / (20·19/(100·99)) — azar = 1.0. */
  sobreAzar: number
}

export interface ParesStats {
  /** Sorteos considerados (fecha más reciente primero? — en orden temporal). */
  muestra: number
  desde: string | null
  hasta: string | null
  pares: ParesStatsRow[]
  /** distribucion[k] = sorteos donde exactamente k de los K pares quedaron completos. */
  distribucion: number[]
  /** % de sorteos donde al menos 1 par aparece completo. */
  alMenos1: number
  /** % donde al menos 2 pares completos. */
  alMenos2: number
  /** % donde al menos 3 pares completos. */
  alMenos3: number
  nota: string
}

const AZAR_CONJUNTA = (20 * 19) / (100 * 99)

const pad2 = (n: number) => String(n).padStart(2, "0")

function numerosDosCifrasUnicos(nums: number[]): Set<number> {
  const out = new Set<number>()
  for (const n of nums) {
    const v = ((Math.trunc(Number(n)) % 100) + 100) % 100
    if (Number.isFinite(v)) out.add(v)
  }
  return out
}

/**
 * FUNCIÓN PURA. `rows` = sorteos con `numbers` (raíz 4 cifras mod-100 se aplican)
 * y `date` opcional. Extrae estadísticas reales por sorteo.
 */
export function calcularStatsPares(
  rows: Array<{ numbers: number[]; date?: string }>,
  pares: Array<[number, number]>,
): ParesStats {
  const muestra = rows.length
  const paresNorm = pares
    .map(([a, b]) => [
      Math.abs(Math.trunc(Number(a))) % 100,
      Math.abs(Math.trunc(Number(b))) % 100,
    ] as [number, number])
    .map(([a, b]) => (a < b ? [a, b] : [b, a] as [number, number]))

  const freq = new Map<string, number>()
  const dist = new Array(paresNorm.length + 1).fill(0)
  let desde: string | null = null
  let hasta: string | null = null

  for (const row of rows) {
    const unicos = numerosDosCifrasUnicos(row.numbers ?? [])
    let completos = 0
    for (const [a, b] of paresNorm) {
      if (unicos.has(a) && unicos.has(b)) {
        freq.set(`${a}-${b}`, (freq.get(`${a}-${b}`) ?? 0) + 1)
        completos += 1
      }
    }
    dist[completos] += 1
    if (row.date) {
      if (!desde || row.date < desde) desde = row.date
      if (!hasta || row.date > hasta) hasta = row.date
    }
  }

  const stats: ParesStatsRow[] = paresNorm.map(([a, b]) => {
    const key = `${a}-${b}`
    const f = freq.get(key) ?? 0
    return {
      a,
      b,
      label: `${pad2(a)}-${pad2(b)}`,
      frecuencia: f,
      probConjunta: muestra ? f / muestra : 0,
      sobreAzar: muestra ? (f / muestra) / AZAR_CONJUNTA : 0,
    }
  })

  const kAlMenos = (k: number) =>
    muestra ? (dist.slice(k).reduce((acc, v) => acc + v, 0) / muestra) * 100 : 0

  return {
    muestra,
    desde,
    hasta,
    pares: stats,
    distribucion: dist,
    alMenos1: kAlMenos(1),
    alMenos2: kAlMenos(2),
    alMenos3: kAlMenos(3),
    nota:
      "Estadística histórica real de tus 5 pares sobre este turno — determinista sobre datos oficiales. " +
      "No hay ventaja demostrada sobre el azar: describe el pasado, no predice el futuro.",
  }
}
