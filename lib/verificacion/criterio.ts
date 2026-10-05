/**
 * Criterios de verificación de predicciones — lógica PURA compartida.
 *
 * Unificación de la auditoría 2026-10-05: antes `cron-verify-predictions`
 * (workhorse) y `auto-verify` (backstop) reimplementaban parseo, matching,
 * posiciones y clasificación por su cuenta, con divergencias sutiles:
 *   - parseo de `numeros` (auto-verify rompía con valores string-coma);
 *   - posiciones: auto-verify ordenaba, cron-verify no;
 *   - Poceada: auto-verify usaba POCEADA_MATCHES.includes([5..8]) mientras
 *     la RPC canónica (verify_predictions_for_draw) marca WON con count >= 5.
 * Resolución: un solo criterio, alineado con la RPC del lado BD.
 *
 * Sin I/O ni Supabase: recibe datos ya leídos y devuelve resultados.
 */

// ─── Tipos de dominio ────────────────────────────────────────────────────────

export interface ParsedNumeros {
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
  redoblonas: string[]
}

export interface PredictionRow {
  id: string
  user_id: string
  date: string
  turno: string
  numeros: unknown
}

export interface HistoryInsert {
  prediction_id: string
  user_id: string
  date: string
  turno: string
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
  redoblonas: string[]
  resultado_oficial: number[]
  aciertos_2: { numero: string; puesto: number }[]
  aciertos_3: { numero: string; puesto: number }[]
  aciertos_4: { numero: string; puesto: number }[]
  aciertos_redoblona: { cabeza: string; acompanante: string }[]
  total_aciertos: number
  verified: boolean
  verified_at: string
  game_id: string
}

export interface DrawRow {
  date?: string
  numbers: number[]
  game_id?: string | null
}

export interface MatchedAciertos {
  aciertos_2: { numero: string; puesto: number }[]
  aciertos_3: { numero: string; puesto: number }[]
  aciertos_4: { numero: string; puesto: number }[]
  aciertos_redoblona: { cabeza: string; acompanante: string }[]
  total_aciertos: number
}

export type EstadoPrediccion = "WON" | "NEAR_MISS" | "LOST"

/** Turnos canónicos de la quiniela (incluye Poceada). */
export const TODOS_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const

// ─── Normalización ───────────────────────────────────────────────────────────

/** "Matutina-2cifras" / "matutina " → "Matutina". */
export function normalizeTurno(t: string): string {
  const base = t.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
  return base.charAt(0).toUpperCase() + base.slice(1)
}

/** Normaliza campos de `numeros` que pueden llegar como array, string único o null. */
export function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => x != null).map((x) => String(x))
  if (typeof v === "string" && v.trim().length > 0) {
    return v.split(",").map((s) => s.trim()).filter(Boolean)
  }
  return []
}

/**
 * Parsea `user_predictions.numeros` (hoy puede ser): array plano, string
 * JSON envuelto en array, u objeto {"2":[..],"3":[..],"4":[..],"r":[..]}.
 */
export function parseNumeros(numeros: unknown): ParsedNumeros {
  let data: unknown = numeros
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    try { data = JSON.parse(data[0] as string) } catch {}
  }

  if (Array.isArray(data)) {
    return {
      numeros_2: toStrArray(data).map((n) => n.padStart(2, "0")),
      numeros_3: [],
      numeros_4: [],
      redoblonas: [],
    }
  }

  // Fail-closed: un string/número suelto (JSON inválido) NO es un objeto de
  // cifras — antes caía al branch de objetos y el indexado de caracteres
  // producía "cifras" inventadas ("000s").
  if (typeof data !== "object" || data === null) {
    return { numeros_2: [], numeros_3: [], numeros_4: [], redoblonas: [] }
  }

  const obj = data as Record<string, unknown>
  return {
    numeros_2: toStrArray(obj?.["2"]).map((n) => n.padStart(2, "0")),
    numeros_3: toStrArray(obj?.["3"]).map((n) => n.padStart(3, "0")),
    numeros_4: toStrArray(obj?.["4"]).map((n) => n.padStart(4, "0")),
    redoblonas: toStrArray(obj?.["r"]),
  }
}

/** Deriva las tres cifras oficiales desde los 20 números del sorteo. */
export function deriveNums(numbers: number[]): {
  nums2: string[]
  nums3: string[]
  nums4: string[]
} {
  return {
    nums2: numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0")),
    nums3: numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0")),
    nums4: numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0")),
  }
}

// ─── Matching (2C / 3C / 4C / redoblona) ─────────────────────────────────────

/**
 * Cruza los números de la predicción con el sorteo oficial derivado.
 * Misma semántica en ambos verificadores: `puesto` = índice (base 1) del
 * primer match en la lista oficial; la redoblona acierta si cabeza Y
 * acompañante aparecen (en cualquier orden) entre los números sorteados.
 */
export function matchearAciertos(
  parsed: ParsedNumeros,
  draw: { nums2: string[]; nums3: string[]; nums4: string[] },
): MatchedAciertos {
  const { nums2, nums3, nums4 } = draw

  const aciertos2 = parsed.numeros_2
    .filter((n: string) => nums2.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums2.indexOf(n) + 1 }))

  const aciertos3 = parsed.numeros_3
    .filter((n: string) => nums3.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums3.indexOf(n) + 1 }))

  const aciertos4 = parsed.numeros_4
    .filter((n: string) => nums4.includes(n))
    .map((n: string) => ({ numero: n, puesto: nums4.indexOf(n) + 1 }))

  const aciertosRedoblona: { cabeza: string; acompanante: string }[] = []
  for (const rb of parsed.redoblonas) {
    const parts = rb.split("-")
    if (parts.length === 2) {
      const cabeza = parts[0].padStart(2, "0")
      const acompanante = parts[1].padStart(2, "0")
      if (nums2.includes(cabeza) && nums2.includes(acompanante)) {
        aciertosRedoblona.push({ cabeza, acompanante })
      }
    }
  }

  return {
    aciertos_2: aciertos2,
    aciertos_3: aciertos3,
    aciertos_4: aciertos4,
    aciertos_redoblona: aciertosRedoblona,
    total_aciertos: aciertos2.length + aciertos3.length + aciertos4.length + aciertosRedoblona.length,
  }
}

// ─── Clasificación final ─────────────────────────────────────────────────────

/**
 * Criterio estricto alineado con la RPC verify_predictions_for_draw:
 *   WON = la CABEZA (primer número sorteado, mod 100) está en tus 2-cifras;
 *   NEAR_MISS = la cabeza ±1 está en tus picks;
 *   si no, LOST.
 * (Antes: WON = total_aciertos > 0, cualquier solape con los 20 números
 * sorteados → 87,9% de "WON" que el azar puro también alcanza ~88%.)
 */
export function estadoQuiniela(resultadoOficial: number[], numeros2: string[]): EstadoPrediccion {
  if (!resultadoOficial?.length || !numeros2?.length) return "LOST"
  const cabeza = String(Number(resultadoOficial[0]) % 100).padStart(2, "0")
  if (numeros2.includes(cabeza)) return "WON"
  const c = parseInt(cabeza, 10)
  const plus = String((c + 1) % 100).padStart(2, "0")
  const minus = String((c - 1 + 100) % 100).padStart(2, "0")
  return numeros2.includes(plus) || numeros2.includes(minus) ? "NEAR_MISS" : "LOST"
}

/**
 * Estado final de una predicción. Criterio estricto alineado con la RPC:
 * - Poceada: WON con total_aciertos >= 5 (la RPC marca `count >= 5`);
 * - quiniela: cabeza/±1 vía estadoQuiniela.
 */
export function estadoFinal(h: HistoryInsert, esPoceada: boolean): EstadoPrediccion {
  if (esPoceada) return h.total_aciertos >= 5 ? "WON" : "LOST"
  return estadoQuiniela(h.resultado_oficial, h.numeros_2)
}

/**
 * Posiciones (1..20) de los aciertos, sin duplicados y ordenadas.
 * (Unificación: auto-verify ya deduplicaba+ordenaba; cron-verify no ordenaba.)
 */
export function posicionesDe(h: HistoryInsert): number[] {
  const positions2 = (h.aciertos_2 || []).map((a) => a.puesto)
  const positions3 = (h.aciertos_3 || []).map((a) => a.puesto)
  const positions4 = (h.aciertos_4 || []).map((a) => a.puesto)
  return [...new Set([...positions2, ...positions3, ...positions4])]
    .filter((p) => p >= 1 && p <= 20)
    .sort((a, b) => a - b)
}
