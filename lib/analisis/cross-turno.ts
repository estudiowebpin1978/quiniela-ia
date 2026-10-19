/**
 * Motor cross-turno (CT) — la única mejora de "frescura" real disponible.
 *
 * Motivo (auditoría 2026-10-19): los tres motores existentes (V6 SQL, V7 TS,
 * ML) trabajan SOLO con la propia serie del turno (`.filter(turno ===)`).
 * Por eso el corte "fecha < hoy" no pierde información: ningún motor consume
 * cruces entre turnos. Este módulo agrega señales de la CADENA CHRONOLÓGICA
 * de la quiniela (Previa → Primera → Matutina → Vespertina → Nocturna →
 * siguiente día), que es la relación clásica que mira un jugador: qué "sigue"
 * después de que salió tal número en el sorteo previo.
 *
 * Modelo (puro, determinista, anti-fuga por construcción — solo ve sorteos
 * estrictamente ANTERIORES al objetivo en el orden cronológico):
 *
 *  1. Cadena de "cabezas" (primaria = numbers[0], el número de cabeza que
 *     sale en la quiniela): h_i.
 *  2. Score(n) para el sorteo objetivo =
 *        P_EXACTA(n) — frecuencia de cabeza n en los sorteos que siguieron
 *        a un sorteo con cabeza == cabeza_previa (condición exacta),
 *        mezclada con
 *        P_GLOBAL(n) — frecuencia de n en TODAS las transiciones h_prev → h_next.
 *     Suavizado de Laplace por simetría (todas las cabezas 0..99 parten iguales
 *     antes de ver datos): el modelo empata a la frecuencia base cuando el
 *     dato es escaso en lugar de sobre-reaccionar.
 *
 * Reglas del proyecto respetadas: sin I/O, sin aleatoriedad, sin inventar
 * datos; parámetros exportados para los tests. El peso CT en el blend queda
 * en 0 hasta que el backtest walk-forward muestre mejora (Regla Omega).
 */

/** Orden cronológico de los turnos de la Quiniela (CABA) dentro del día. */
export const ORDEN_TURNO: Record<string, number> = {
  Previa: 0,
  Primera: 1,
  Matutina: 2,
  Vespertina: 3,
  Nocturna: 4,
}

/** Mezcla entre condición exacta (cabeza previa igual) y global. */
export const MEZCLA_EXACTA = 0.6

/** α del suavizado de Laplace sobre 100 cabezas posibles. */
export const ALFA_LAPLACE = 1

/** Sorteo mínimo del histórico (draws ya mapeados a { fecha, turno, numbers }). */
export interface DrawCronologico {
  fecha: string
  turno: string
  numbers: number[]
}

/**
 * ¿El sorteo d es estrictamente ANTERIOR al objetivo (fecha objetivo +
 * orden de turno)? Anti-fuga: nunca incluye el propio sorteo ni los
 * posteriores de su día.
 */
function esAnterior(
  d: DrawCronologico,
  fechaObjetivo: string,
  ordenObjetivo: number,
): boolean {
  if (d.fecha < fechaObjetivo) return true
  if (d.fecha > fechaObjetivo) return false
  const orden = ORDEN_TURNO[d.turno]
  if (orden === undefined) return false
  return orden < ordenObjetivo
}

/**
 * Distribución de cabeza→cabeza aprendida del histórico. Devuelve dos
 * histogramas: transiciones condicionadas a la cabeza previa exacta y la
 * matriz global (todas las transiciones del histórico).
 */
export function entrenarCadena(
  historico: DrawCronologico[],
): { exacta: Map<number, Map<number, number>>; global: Map<number, number> } {
  const exacta = new Map<number, Map<number, number>>()
  const global = new Map<number, number>()

  const conCabeza = historico
    .filter((d) => Array.isArray(d.numbers) && d.numbers.length > 0 && Number.isFinite(d.numbers[0]))
    .map((d) => ({ fecha: d.fecha, turno: d.turno, cabeza: d.numbers[0] % 100 }))

  for (let i = 0; i + 1 < conCabeza.length; i++) {
    const prev = conCabeza[i].cabeza
    const next = conCabeza[i + 1].cabeza

    let fila = exacta.get(prev)
    if (!fila) {
      fila = new Map()
      exacta.set(prev, fila)
    }
    fila.set(next, (fila.get(next) || 0) + 1)
    global.set(next, (global.get(next) || 0) + 1)
  }

  return { exacta, global }
}

/**
 * Puntaje cross-turno por número (0..99) para el sorteo objetivo.
 *
 * @param historico sorteos del juego (CABA), cualquier orden de entrada.
 * @param fechaObjetivo "YYYY-MM-DD" del sorteo a predecir.
 * @param turnoObjetivo turno objetivo (debe estar en ORDEN_TURNO).
 * @returns Map numero → score (probabilidad suavizada, mayor = mejor);
 *          Map vacía si la cabeza previa no existe aún (falta histórico).
 */
export function predecirCrossTurno(
  historico: DrawCronologico[],
  fechaObjetivo: string,
  turnoObjetivo: string,
): Map<number, number> {
  const vacia = new Map<number, number>()
  const ordenObjetivo = ORDEN_TURNO[turnoObjetivo]
  if (ordenObjetivo === undefined) return vacia

  const anteriores = historico
    .filter((d) => esAnterior(d, fechaObjetivo, ordenObjetivo))
    .slice()
    .sort((a, b) =>
      a.fecha === b.fecha
        ? (ORDEN_TURNO[a.turno] ?? 0) - (ORDEN_TURNO[b.turno] ?? 0)
        : a.fecha < b.fecha
          ? -1
          : 1,
    )

  const previa = anteriores[anteriores.length - 1]
  if (!previa || !Array.isArray(previa.numbers) || previa.numbers.length === 0) {
    return vacia
  }
  const cabezaPrevia = previa.numbers[0] % 100

  const { exacta, global } = entrenarCadena(
    anteriores.filter((d) => Array.isArray(d.numbers) && d.numbers.length > 0),
  )

  const fila = exacta.get(cabezaPrevia)
  const totalFila = fila ? Array.from(fila.values()).reduce((s, c) => s + c, 0) : 0
  const totalGlobal = Array.from(global.values()).reduce((s, c) => s + c, 0)

  const scores = new Map<number, number>()
  for (let n = 0; n < 100; n++) {
    const cExacta = fila?.get(n) || 0
    const pExacta = (cExacta + ALFA_LAPLACE) / (totalFila + ALFA_LAPLACE * 100)
    const cGlobal = global.get(n) || 0
    const pGlobal = (cGlobal + ALFA_LAPLACE) / (totalGlobal + ALFA_LAPLACE * 100)
    scores.set(n, MEZCLA_EXACTA * pExacta + (1 - MEZCLA_EXACTA) * pGlobal)
  }
  return scores
}
