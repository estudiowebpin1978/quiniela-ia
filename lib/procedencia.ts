/**
 * Procedencia de juegos en la tabla `draws` (frente C, migración
 * 20261018010000_quiniela_filtrar_procedencia.sql).
 *
 * La tabla guarda UNA extracción por (date, turno) con índice único GLOBAL, y
 * el juego al que pertenece lo define `jurisdiccion`:
 *
 *  · 'CABA'  → Quiniela de la Ciudad (ex Nacional), game ac593199-....
 *              Histórico etiquetado 'nacional' hasta 2026-09-28, canonicalizado
 *              a 'CABA' por la migración.
 *  · 'provincia' → Quiniela de la Provincia (juego distinto; comparte game_id
 *              con Quiniela por error histórico de origen).
 *
 * Todo loader que alimente motores, estadísticas o verificación DEBE filtrar
 * por jurisdicción: sin el filtro, frecuencia/markov/bayes/pesos mezclan
 * extracciones de juegos diferentes bajo el mismo nombre de turno.
 */
export const JURIS_QUINIELA_CIUDAD = ["CABA"] as const

/**
 * Todos los juegos dibujados por LOTBA (Ciudad): Quiniela de la Ciudad.
 * Útil para lecturas multi-turno que no pueden preguntarle a un turno solo.
 * SIEMPRE excluye 'provincia' (juego de otra jurisdicción).
 */
export const JURIS_LOTBA = [...JURIS_QUINIELA_CIUDAD]

/**
 * Jurisdicciones válidas para el turno pedido. Todos los turnos oficiales son
 * extracciones de la Quiniela de la Ciudad ('CABA').
 */
export function jurisParaTurno(_turno: string): string[] {
  return [...JURIS_QUINIELA_CIUDAD]
}

/** Valor para PostgREST: `jurisdiccion=in.(...)` en URLs REST. */
export function jurisRest(turno: string): string {
  return jurisParaTurno(turno).join(",")
}
