/**
 * Construcción de filas de prediction_history — compartido por
 * cron-verify-predictions y auto-verify (auditoría 2026-10-05).
 * Sin I/O: solo transforma predicción + sorteo en la fila de historial.
 */

import { GAME_ID as NACIONAL_GAME_ID, POCEADA_GAME_ID } from "@/lib/scrapers/types"
import {
  deriveNums,
  matchearAciertos,
  parseNumeros,
  type DrawRow,
  type HistoryInsert,
  type PredictionRow,
} from "./criterio"

/**
 * Construye la fila de prediction_history para una predicción + SU sorteo.
 * `gameIdFallback` se usa cuando el sorteo no trae game_id (filas viejas):
 * Poceada pasa POCEADA_GAME_ID, el resto usa el Nacional por defecto.
 */
export function buildHistoryInsert(
  pred: PredictionRow,
  draw: DrawRow,
  gameIdFallback: string = NACIONAL_GAME_ID,
): HistoryInsert {
  // Poceada es un juego SOLO de 2 cifras (00-99), distinto de la Quiniela.
  // Se detecta por el turno (o por el game_id del sorteo) y se fuerza el
  // parseo + matching a 2 cifras: así un registro legacy con claves "3"/"4"
  // no fabrica aciertos de 3/4 cifras a partir del sorteo de Poceada
  // ("000".."099" / "0000".."0099" sin sentido).
  const esPoceada = /poceada/i.test(pred.turno || "") || draw.game_id === POCEADA_GAME_ID
  const parsed = parseNumeros(pred.numeros)
  const parsed2c = esPoceada
    ? { ...parsed, numeros_3: [], numeros_4: [], redoblonas: [] }
    : parsed
  const { nums2, nums3, nums4 } = deriveNums(draw.numbers, esPoceada)
  const aciertos = matchearAciertos(parsed2c, { nums2, nums3, nums4 })

  return {
    prediction_id: pred.id,
    user_id: pred.user_id,
    date: pred.date,
    turno: pred.turno,
    numeros_2: parsed2c.numeros_2,
    numeros_3: parsed2c.numeros_3,
    numeros_4: parsed2c.numeros_4,
    redoblonas: parsed2c.redoblonas,
    resultado_oficial: draw.numbers,
    aciertos_2: aciertos.aciertos_2,
    aciertos_3: aciertos.aciertos_3,
    aciertos_4: aciertos.aciertos_4,
    aciertos_redoblona: aciertos.aciertos_redoblona,
    total_aciertos: aciertos.total_aciertos,
    verified: true,
    verified_at: new Date().toISOString(),
    game_id: draw.game_id || gameIdFallback,
  }
}
