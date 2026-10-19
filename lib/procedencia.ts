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
 *  · 'ciudad' → Quiniela Poceada (juego legado de LOTBA), game d0e1f2a3-....
 *              turno 'Poceada'.
 *  · 'provincia' → Quiniela de la Provincia (juego distinto; comparte game_id
 *              con Quiniela por error histórico de origen).
 *
 * Todo loader que alimente motores, estadísticas o verificación DEBE filtrar
 * por jurisdicción: sin el filtro, frecuencia/markov/bayes/pesos mezclan
 * extracciones de juegos diferentes bajo el mismo nombre de turno.
 */
export const JURIS_QUINIELA_CIUDAD = ["CABA"] as const
export const JURIS_POCEADA_LEGADA = ["ciudad"] as const

/**
 * Todos los juegos dibujados por LOTBA (Ciudad): Quiniela + Poceada legado.
 * Útil para lecturas multi-turno que no pueden preguntarle a un turno solo.
 * SIEMPRE excluye 'provincia' (juego de otra jurisdicción).
 */
export const JURIS_LOTBA = [...JURIS_QUINIELA_CIUDAD, ...JURIS_POCEADA_LEGADA]

/**
 * Jurisdicciones válidas para el turno pedido. El turno 'Poceada' pertenece al
 * juego Poceada legado ('ciudad'); el resto de turnos son extracciones de la
 * Quiniela de la Ciudad ('CABA').
 */
export function jurisParaTurno(turno: string): string[] {
  return turno.toLowerCase().includes("poceada")
    ? [...JURIS_POCEADA_LEGADA]
    : [...JURIS_QUINIELA_CIUDAD]
}

/** Valor para PostgREST: `jurisdiccion=in.(...)` en URLs REST. */
export function jurisRest(turno: string): string {
  return jurisParaTurno(turno).join(",")
}
