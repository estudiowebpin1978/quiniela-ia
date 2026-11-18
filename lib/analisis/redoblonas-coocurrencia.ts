/**
 * Motor de co-ocurrencia de pares de 2 cifras — ESTADÍSTICA DESCRIPTIVA REAL.
 *
 * Qué hace: a partir de los extractos oficiales (draws), cuenta cuántas veces
 * aparecen presentes, en el MISMO sorteo, cada PAREJA de números de 2 cifras
 * (00-99), junto con las apariciones individuales. Con eso calcula:
 *   - frecuencia conjunta (sorteo con ambos presentes)
 *   - probabilidad conjunta  P(A ∧ B) = freqAB / totalSorteos
 *   - probabilidad condicional P(A | B) = freqAB / freqB
 *   - "sobre-azar": ratio probConjunta / 0.0384 (hipergeométrica exacta del azar)
 *
 * Qué NO hace (honesto, por diseño):
 *   - No hay evidencia OOS de que los pares "calientes" salgan más en el futuro.
 *     Cada sorteo es independiente y justo (χ² p>0.38 en esta base, corregido
 *     Bonferroni). Esto es descripción histórica, no un método ganador.
 *   - Los valores de azar: P(A ∧ B) ≈ 3.84%, P(A | B) ≈ 19.2%.
 *
 * Determinista: mismos sorteos → mismos resultados. Sin red, testeable.
 */

export interface ParCoOcurrencia {
  /** Los dos números del par (00-99), a < b. */
  a: number
  b: number
  /** Sorteos donde el par aparece junto. */
  frecuencia: number
  /** P(A ∧ B) = frecuencia / totalSorteos (0-1). */
  probConjunta: number
  /** P(A | B) = frecuencia / freqB. */
  probA_dado_B: number
  /** P(B | A) = frecuencia / freqA. */
  probB_dado_A: number
  /** probConjunta / 0.03838 (azar = 1.0). */
  sobreAzar: number
}

export interface InformeCoOcurrencia {
  turno: string
  /** Sorteos usados como muestra. */
  totalSorteos: number
  paresDistintos: number
  /** Hipergeométrica exacta de azar: C(98,20)/C(100,20)... = (20·19)/(100·99). */
  azarConjunta: number
  /** Ventaja condicional aleatoria ≈ 19/99 ≈ 0.1919. */
  azarCondicional: number
  /** Top pares ordenados por frecuencia conjunta. */
  pares: ParCoOcurrencia[]
  /** Rango temporal de los sorteos (min→max ISO YYYY-MM-DD). */
  desde: string | null
  hasta: string | null
  /** Aviso honesto fijo: describe, no predice. */
  nota: string
}

/** Azar: P(par específico presente) = (20·19)/(100·99) ≈ 0.03838. */
export const AZAR_CONJUNTA = (20 * 19) / (100 * 99)
/** Azar: P(A | B presente) = 19/99 ≈ 0.1919. */
export const AZAR_CONDICIONAL = 19 / 99

/** Extrae las 2 cifras únicas de un extracto (mod 100, ordenadas). */
export function numerosUnicosDosCifras(nums: number[]): number[] {
  const set = new Set<number>()
  for (const n of nums) {
    const v = ((Math.trunc(Number(n)) % 100) + 100) % 100
    if (Number.isFinite(v)) set.add(v)
  }
  return [...set].sort((a, b) => a - b)
}

export interface OpcionesCoOcurrencia {
  /** Descarta pares con frecuencia < minSoporte (ruido estadístico). Default 2. */
  minSoporte?: number
  /** Cantidad máxima de pares a devolver (por frecuencia). Default 10. */
  topN?: number
}

/**
 * Procesa N extractos oficiales (cada extracto = 20 números) y devuelve los
 * pares más frecuentes con sus métricas reales. FUNCIÓN PURA.
 */
export function calcularCoOcurrencias(
  sorteos: Array<{ numbers: number[]; date?: string }>,
  turno = "Primera",
  opciones: OpcionesCoOcurrencia = {},
): InformeCoOcurrencia {
  const { minSoporte = 2, topN = 10 } = opciones

  const frecuenciaPar = new Map<string, number>()
  const frecuenciaIndividual = new Map<number, number>()
  const paresTocados = new Set<number>()

  let totalSorteos = 0
  let desde: string | null = null
  let hasta: string | null = null

  for (const row of sorteos) {
    const nums = row.numbers ?? []
    if (nums.length === 0) continue
    const unicos = numerosUnicosDosCifras(nums)
    if (unicos.length === 0) continue
    totalSorteos++

    const f = row.date ?? null
    if (f) {
      if (!desde || f < desde) desde = f
      if (!hasta || f > hasta) hasta = f
    }

    for (const a of unicos) {
      frecuenciaIndividual.set(a, (frecuenciaIndividual.get(a) ?? 0) + 1)
      paresTocados.add(a)
    }
    // Combinaciones i<j de los números únicos de 2 cifras del extracto
    for (let i = 0; i < unicos.length; i++) {
      const a = unicos[i]
      for (let j = i + 1; j < unicos.length; j++) {
        const b = unicos[j]
        const key = `${a}-${b}`
        frecuenciaPar.set(key, (frecuenciaPar.get(key) ?? 0) + 1)
      }
    }
  }

  const pares: ParCoOcurrencia[] = []
  for (const [key, freq] of frecuenciaPar) {
    if (freq < minSoporte) continue
    const [aStr, bStr] = key.split("-")
    const a = Number(aStr)
    const b = Number(bStr)
    const freqA = frecuenciaIndividual.get(a) ?? 0
    const freqB = frecuenciaIndividual.get(b) ?? 0
    pares.push({
      a,
      b,
      frecuencia: freq,
      probConjunta: totalSorteos ? freq / totalSorteos : 0,
      probA_dado_B: freqB > 0 ? freq / freqB : 0,
      probB_dado_A: freqA > 0 ? freq / freqA : 0,
      sobreAzar: totalSorteos ? (freq / totalSorteos) / AZAR_CONJUNTA : 0,
    })
  }

  pares.sort((x, y) => y.frecuencia - x.frecuencia)

  return {
    turno,
    totalSorteos,
    paresDistintos: pares.length,
    azarConjunta: AZAR_CONJUNTA,
    azarCondicional: AZAR_CONDICIONAL,
    pares: pares.slice(0, Math.max(1, topN)),
    desde,
    hasta,
    nota:
      "Estadística histórica de pares en un mismo extracto. Describe el pasado; no garantiza el futuro: " +
      "cada sorteo es independiente. Azar de referencia P(A ∧ B) ≈ 3.84%. " +
      "Ningún par supera al azar de forma demostrable en OOS.",
  }
}
