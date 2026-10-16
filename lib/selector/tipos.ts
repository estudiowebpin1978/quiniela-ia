/**
 * Meta-selector histórico de Quiniela Ciudad (ex Nacional) — tipos.
 *
 * Módulo INDEPENDIENTE: no toca OMEGA V6/V7, ni predictions_cache, ni
 * mis-predicciones. Sólo evalúa candidatos (motores existentes + baselines)
 * con corte temporal estricto para decidir, si los datos lo demuestran, si un
 * ensemble de selección aporta valor sobre las referencias.
 *
 * Convenciones:
 *  - Los rankings son arreglos de 100 enteros (00-99) en orden de preferencia;
 *    los ceros iniciales se conservan al presentar ("00", "07").
 *  - Un sorteo se representa con su fecha, turno y los 20 números oficiales
 *    (0000-9999, posicionados). El criterio de acierto se aplica con
 *    `lib/verificacion/criterio.ts` (2C: cabeza; 3C/4C: cualquiera de los 20).
 */

/** Sorteo oficial de la columna Ciudad (20 números posicionados 0000-9999). */
export interface SorteoSelector {
  fecha: string // yyyy-mm-dd
  turno: string
  numbers: number[] // 20 números crudos del sorteo
}

/** Resultado crudo de un candidato para un corte temporal dado. */
export interface RankingCandidato {
  /** Nombre estable del candidato (etiqueta de evaluación). */
  nombre: string
  /** Ranking completo 00-99 (índice = número, valor = posición 0 = mejor). */
  ranking: number[]
}

/** Contexto de un corte walk-forward: SÓLO sorteos anteriores al evaluado. */
export interface CorteContexto {
  /** Sorteos estrictamente anteriores al sorteo evaluado. */
  historial: SorteoSelector[]
  turno: string
  /** Fecha del sorteo evaluado (yyyy-mm-dd) — corte "as of". */
  asOf: string
}

/**
 * Candidato evaluador: produce su ranking a partir del contexto de corte.
 * - "puro": TS puro síncrono (baselines).
 * - "motor_existente": usa un motor existente del repo (V7), síncrono o async.
 * - "inyectado": requiere I/O externo (V6 SQL, ML) — la función se inyecta
 *   desde el runner con su mecanismo anti-fuga nativo; el módulo puro no hace
 *   red por su cuenta.
 */
export interface CandidatoSelector {
  nombre: string
  fuente: "puro" | "motor_existente" | "inyectado"
  evaluar: (ctx: CorteContexto) => number[] | Promise<number[]>
}

/** Turnos de la Quiniela Ciudad (sin Poceada: es juego distinto). */
export const TURNOS_QUINIELA_CIUDAD = [
  "Previa",
  "Primera",
  "Matutina",
  "Vespertina",
  "Nocturna",
] as const

/** Objetivos de apuesta evaluados por separado. */
export type ObjetivoSelector = "2c" | "3c" | "4c"

/** Métricas agregadas de un candidato en un período. */
export interface MetricasCandidato {
  /** Cantidad de sorteos evaluados en el período. */
  n: number
  // ── Objetivo 2 cifras (criterio: cabeza ∈ top-K de 2C) ──
  /** Proporción de sorteos cuyo top-K contiene la cabeza (criterio WON). */
  cabezaEnTopK: number
  /** Intersección media top-K con los 20 distintos del sorteo (0..K). */
  mediaHits2C: number
  /** Media del rank (1..100) de la cabeza en el ranking completo (menor = mejor). */
  rankCabezaMedio: number
  /** Mean reciprocal rank de la cabeza. */
  mrr: number
  // ── Objetivos 3/4 cifras (criterio: cualquier puesto 1..20) ──
  /** Proporción con ≥1 acierto de 3 cifras entre los 20 puestos (top-K). */
  acierto3C: number | null
  /** Proporción con ≥1 acierto de 4 cifras entre los 20 puestos (top-K). */
  acierto4C: number | null
}

/** Pesos finales del meta-selector para un turno. */
export interface PesosSelector {
  /** pesos por nombre de candidato (suman 1). */
  pesos: Record<string, number>
  /** true si la muestra de validación no alcanzó → pesos de referencia. */
  experimental: boolean
  /** Cómo se obtuvieron (referencia | validacion_cronologica_interna). */
  metodo: "referencia" | "validacion_cronologica_interna"
  /** Cantidad de cortes de validación interna usados. */
  nValid: number
  /** Parámetros de regularización aplicados. */
  regularizacion: { lambda: number; beta: number; pesoMin: number; pesoMax: number }
}

/** Solape de señales entre pares de candidatos (duplicación de señales). */
export interface SolapeSenales {
  a: string
  b: string
  /** |topK(a) ∩ topK(b)| / K, promedio sobre los cortes (0..1). */
  solapeTopK: number
  /** Correlación de Spearman media entre rankings completos (-1..1). */
  spearman: number
}

export const VERSION_SELECTOR = "qc-selector-1.0.0"
