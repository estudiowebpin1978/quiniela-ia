/**
 * Reglas oficiales del Brinco — Lotería de Santa Fe (Caja de Acción Social).
 *
 * Fuentes verificadas (2026-10-09):
 *  - https://www.loteriasantafe.gov.ar/brinco-preguntas-frecuentes/  (reglas, premios, Junior)
 *  - https://www.loteriasantafe.gov.ar/resena-de-juegos/             (historia: 2000, Junior N°1000, Siempre Sale 2023-05-01)
 *  - https://cas.gob.ar/juegos/sorteos/resultados?juego=brinco       (resultados: concurso + Tradicional + Junior)
 *
 * Brinco Tradicional: se extraen 6 números de 40 bolillas (00-39). El orden no
 * importa. Premios por 6 / 5 / 4 / 3 aciertos (1°/2°/3°/4°). Es un juego
 * POCEADO (parimutuel): los premios 1°-3° se DIVIDEN entre ganadores y hay pozo
 * acumulable → NO existe una tabla de premios fija con la cual calcular un EV
 * determinista como en la Quiniela.
 *
 * Brinco Junior: segunda extracción de 6 números del MISMO universo, jugado con
 * la MISMA boleta y sin costo adicional. La misma jugada participa de ambos
 * sorteos. Sus reglas cambiaron con el tiempo:
 *   - Concurso < 1000: no existía el Junior.
 *   - Concurso >= 1000 (aprox. 2019) hasta 2023-04-30: el Junior solo se ganaba
 *     con 6 aciertos.
 *   - Desde 2023-05-01: "Junior Siempre Sale", premio fijo garantizado que se
 *     gana con 6, 5 y 4 aciertos.
 *
 * ADVERTENCIA: el universo del Brinco es 00-39. NUNCA generar una jugada de
 * Brinco con el universo 00-99 de la Quiniela.
 */

// UUID estable del juego Brinco (fila en la tabla `games`).
export const BRINCO_GAME_ID = "3f8e2a1b-9c4d-4e6f-8a7b-5c9d1e2f3a4b"

export const BRINCO_UNIVERSO_MIN = 0
export const BRINCO_UNIVERSO_MAX = 39
export const BRINCO_TOTAL_BOLILLAS = 40
export const BRINCO_NUMEROS_POR_JUGADA = 6

/** C(40,6) = 3.838.380 combinaciones posibles. */
export const BRINCO_COMBINACIONES = 3_838_380

/** Aciertos que premia el Tradicional (1° a 4° premio). */
export const BRINCO_PREMIOS_TRADICIONAL: readonly number[] = [3, 4, 5, 6]

/** El Junior existe a partir del concurso N° 1000 (reseña oficial). */
export const JUNIOR_EXISTE_DESDE_CONCURSO = 1000
/** Desde el 01-05-2023 el Junior pasa a "Siempre Sale" (premio garantizado 6/5/4). */
export const JUNIOR_SIEMPRE_SALE_DESDE = "2023-05-01"

/** Período reglamentario del Junior aplicable a un concurso/fecha. */
export type PeriodoJunior = "sin_junior" | "junior_solo_6" | "junior_siempresale"

/** Estado de veracidad de un sorteo importado (convención del proyecto). */
export type EstadoVerificacion =
  | "verified_official"
  | "cross_checked"
  | "pending_verification"
  | "rejected"

const UNIVERSO_SET: ReadonlySet<number> = new Set(
  Array.from({ length: BRINCO_TOTAL_BOLILLAS }, (_, i) => i),
)

/** Array 0..39 para validación de contención en CHECKs de SQL. */
export const BRINCO_UNIVERSO_ARRAY: readonly number[] = Array.from(
  { length: BRINCO_TOTAL_BOLILLAS },
  (_, i) => i,
)

// ─── Validación de números ──────────────────────────────────────────────────

export function esNumeroBrinco(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= BRINCO_UNIVERSO_MIN && n <= BRINCO_UNIVERSO_MAX
}

/**
 * Normaliza una lista cruda a enteros válidos 0..39.
 * Devuelve null si algún valor no es entero dentro del universo.
 */
export function normalizarNumeros(raw: unknown[]): number[] | null {
  const out: number[] = []
  for (const v of raw) {
    const n = typeof v === "string" ? Number.parseInt(v, 10) : typeof v === "number" ? v : NaN
    if (!esNumeroBrinco(n)) return null
    out.push(n)
  }
  return out
}

export interface ValidacionCombinacion {
  ok: boolean
  errores: string[]
}

/**
 * Valida una jugada de Brinco: exactamente 6 números ENTEROS distintos en 0..39.
 * No acepta repetidos, ni menos de 6, ni fuera de rango.
 */
export function validarCombinacion(numeros: unknown): ValidacionCombinacion {
  const errores: string[] = []
  if (!Array.isArray(numeros)) {
    return { ok: false, errores: ["La combinación debe ser una lista de números"] }
  }
  if (numeros.length !== BRINCO_NUMEROS_POR_JUGADA) {
    errores.push(`Debe tener exactamente ${BRINCO_NUMEROS_POR_JUGADA} números (recibido: ${numeros.length})`)
  }
  const norm = normalizarNumeros(numeros as unknown[])
  if (norm === null) {
    errores.push(`Todos los números deben ser enteros entre ${BRINCO_UNIVERSO_MIN} y ${BRINCO_UNIVERSO_MAX}`)
    return { ok: false, errores }
  }
  const distintos = new Set(norm)
  if (distintos.size !== norm.length) {
    errores.push("No se permiten números repetidos")
  }
  return { ok: errores.length === 0, errores }
}

/** Formato de dos cifras para mostrar: 5 → "05", 39 → "39". */
export function formatoMostrar(n: number): string {
  return String(n).padStart(2, "0")
}

/** Combinación ordenada y formateada (para mostrar / comparar). */
export function formatoCombinacion(numeros: number[]): string[] {
  return [...numeros].sort((a, b) => a - b).map(formatoMostrar)
}

// ─── Reglas del Junior por período ──────────────────────────────────────────

/**
 * Determina el período reglamentario del Junior para un concurso.
 * Se usa la fecha como eje principal y el concurso como guardia de existencia.
 */
export function periodoJunior(fechaISO: string, concurso?: number): PeriodoJunior {
  if (concurso !== undefined && concurso < JUNIOR_EXISTE_DESDE_CONCURSO) {
    return "sin_junior"
  }
  return fechaISO < JUNIOR_SIEMPRE_SALE_DESDE ? "junior_solo_6" : "junior_siempresale"
}

/** Aciertos del Junior que otorgan premio según el período. */
export function aciertosPremiadosJunior(periodo: PeriodoJunior): number[] {
  switch (periodo) {
    case "junior_solo_6":
      return [6]
    case "junior_siempresale":
      return [4, 5, 6]
    case "sin_junior":
    default:
      return []
  }
}

/** ¿El Junior aplica para esta fecha/concurso? */
export function juniorAplica(fechaISO: string, concurso?: number): boolean {
  return periodoJunior(fechaISO, concurso) !== "sin_junior"
}

// ─── Conteo de aciertos ─────────────────────────────────────────────────────

/**
 * Cuenta cuántos números de la jugada aparecen en el sorteo oficial.
 * El orden no importa (regla oficial). Usar conjuntos.
 */
export function contarAciertos(jugada: number[], sorteo: number[]): number {
  const set = new Set(sorteo)
  let aciertos = 0
  for (const n of jugada) if (set.has(n)) aciertos++
  return aciertos
}

// ─── Probabilidades (para backtest y calibración honesta) ───────────────────

/** Coeficiente binomial pequeño, seguro y exacto. */
export function combinatoria(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const kk = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= kk; i++) r = (r * (n - kk + i)) / i
  return Math.round(r)
}

/**
 * Distribución HIPERGEOMÉTRICA exacta de aciertos para elegir 6 de 40 cuando
 * el sorteo también tiene 6 ganadores: P(k) = C(6,k)·C(34,6-k) / C(40,6).
 * Es la línea base del azar puro contra la cual comparar cualquier estrategia.
 */
export function distribucionAzar(): number[] {
  const dist = new Array<number>(BRINCO_NUMEROS_POR_JUGADA + 1).fill(0)
  for (let k = 0; k <= BRINCO_NUMEROS_POR_JUGADA; k++) {
    dist[k] = (combinatoria(6, k) * combinatoria(34, 6 - k)) / BRINCO_COMBINACIONES
  }
  return dist
}

/** Esperanza de aciertos para una jugada aleatoria: 6·6/40 = 0,9. */
export function esperanzaAzar(): number {
  return (BRINCO_NUMEROS_POR_JUGADA * BRINCO_NUMEROS_POR_JUGADA) / BRINCO_TOTAL_BOLILLAS
}

/** ¿La combinación es un conjunto de 6 del universo válido? (cheap check) */
export function esCombinacionValidaRapida(nums: number[]): boolean {
  return validarCombinacion(nums).ok
}

/** Utilidad para tests/backtest: universo como array. */
export function universo(): number[] {
  return Array.from(UNIVERSO_SET)
}
