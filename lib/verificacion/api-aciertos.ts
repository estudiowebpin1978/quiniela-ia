/**
 * Mapeo de una predicción → aciertos para la API `mis-predicciones`.
 *
 * Lógica PURA (sin I/O ni Supabase) extraída del route el 2026-10-07 para
 * poder testear el bug "Sin coincidencias cuando sí las hubo".
 *
 * Reglas (auditoría 2026-10-07):
 *  1. Fuente de aciertos: `prediction_history` (criterio unificado de
 *     lib/verificacion: 2C/3C/4C) y, si no existe todavía, cálculo directo
 *     picks × sorteo oficial con el mismo matching.
 *  2. `user_predictions.aciertos` NO se lee: esa columna es mixta — la RPC
 *     guarda posiciones del sorteo, 0 como placeholder del ±1 de NEAR_MISS,
 *     centinelas 3/4/5 (marcas de 3C/4C/redoblona) y en Poceada un conteo
 *     (5-8). Interpretarla como posiciones fabricaba números que el usuario
 *     no marcó y perdía aciertos reales.
 *  3. `acerto` = hubo al menos una coincidencia; NO equivale a "ganó"
 *     (status WON). Coincidir ≠ ganar.
 */

import type { Acierto } from "@/lib/api/types"

/** Fila de `prediction_history` (solo los campos que usa el mapeo). */
export interface HistorialAciertos {
  aciertos_2: { numero: string; puesto: number }[] | null
  aciertos_3: { numero: string; puesto: number }[] | null
  aciertos_4: { numero: string; puesto: number }[] | null
  resultado_oficial: number[] | null
}

export interface ParamsApiAciertos {
  /** `user_predictions.numeros` (array plano o {"2":[..],"3":[..],"4":[..]}) */
  numeros: unknown
  /** tier.canAccessPremiumFeatures — sin premium no se muestran 3/4 cifras */
  premium: boolean
  /** `prediction_history` de la predicción, si existe */
  historial: HistorialAciertos | null
  /** `draws.numbers` del sorteo oficial, si existe */
  numerosSorteo: number[] | null
}

export interface ResultadoApiAciertos {
  numeros_2: string[]
  numeros_3: string[]
  numeros_4: string[]
  aciertos_2: Acierto[]
  aciertos_3: Acierto[]
  aciertos_4: Acierto[]
  /** 2C + 3C + 4C */
  todos: Acierto[]
  /** Derivados del resultado oficial (o del historial) */
  resultado_2: string[]
  resultado_3: string[]
  resultado_4: string[]
  /** ¿Hubo al menos una coincidencia? (≠ "ganó") */
  acerto: boolean
}

const norm2 = (v: string) => { const s = String(v).replace(/^0+/, ""); return s.slice(-2).padStart(2, "0") }
const norm3 = (v: string) => { const s = String(v).replace(/^0+/, ""); return s.slice(-3).padStart(3, "0") }
const norm4 = (v: string) => String(v).padStart(4, "0")

/**
 * Parsea `user_predictions.numeros` (array plano, string-JSON envuelto en
 * array u objeto de cifras). FAIL-CLOSED: un string/número suelto o un JSON
 * inválido NO produce cifras inventadas (mismo criterio que
 * `parseNumeros` de lib/verificacion/criterio.ts) — antes el route hacía
 * `norm2("{"2":...")` y generaba "cifras" a partir de la basura.
 */
export function parseNumerosApi(numeros: unknown): number[] | Record<string, string[]> {
  let data: unknown = numeros
  if (Array.isArray(data) && data.length === 1 && typeof data[0] === "string") {
    const raw = (data[0] as string).trim()
    // Solo un {..}/[..] JSON es un envoltorio de cifras: "84" (predicción de
    // UN número) se queda como pick y no se pierde en el intento de parseo.
    if (raw.startsWith("{") || raw.startsWith("[")) {
      try {
        data = JSON.parse(raw)
      } catch {
        data = null // JSON inválido → sin cifras (fail-closed)
      }
    }
  }
  if (Array.isArray(data)) return data as number[]
  if (typeof data === "object" && data !== null) return data as Record<string, string[]>
  return {}
}

/** Solo entradas numéricas: descarta basura que normX() convertiría en "cifras". */
const soloDigitos = (arr: unknown[]): string[] =>
  arr.filter((n) => n != null && /^\d+$/.test(String(n).trim())).map((n) => String(n).trim())

/** Deriva los 20/20/20 números oficiales en formato 2/3/4 cifras. */
function derivarResultado(numbers: number[]): { r2: string[]; r3: string[]; r4: string[] } {
  return {
    r2: numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0")),
    r3: numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0")),
    r4: numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0")),
  }
}

export function calcularAciertosApi(p: ParamsApiAciertos): ResultadoApiAciertos {
  const numerosData = parseNumerosApi(p.numeros)
  const esArray = Array.isArray(numerosData)

  const numeros_2: string[] = esArray
    ? soloDigitos(numerosData as unknown[]).map(norm2)
    : soloDigitos(((numerosData as Record<string, string[]>)?.["2"] || []) as unknown[]).map(norm2)
  let numeros_3: string[] = []
  let numeros_4: string[] = []
  if (!esArray && p.premium) {
    numeros_3 = soloDigitos(((numerosData as Record<string, string[]>)?.["3"] || []) as unknown[]).map(norm3)
    numeros_4 = soloDigitos(((numerosData as Record<string, string[]>)?.["4"] || []) as unknown[]).map(norm4)
  }

  let aciertos_2: Acierto[] = []
  let aciertos_3: Acierto[] = []
  let aciertos_4: Acierto[] = []
  let r2: string[] = []
  let r3: string[] = []
  let r4: string[] = []

  if (p.historial) {
    // 1) Historial: criterio unificado (ya trae {numero, puesto}).
    aciertos_2 = (p.historial.aciertos_2 || []).map((a) => ({ ...a, tipo: 2 as const }))
    if (p.premium) {
      aciertos_3 = (p.historial.aciertos_3 || []).map((a) => ({ ...a, tipo: 3 as const }))
      aciertos_4 = (p.historial.aciertos_4 || []).map((a) => ({ ...a, tipo: 4 as const }))
    }
    // Si el historial no trae resultado oficial, se usa el sorteo directo.
    const oficiales = p.historial.resultado_oficial?.length
      ? p.historial.resultado_oficial
      : (p.numerosSorteo || [])
    ;({ r2, r3, r4 } = derivarResultado(oficiales))
  } else if (p.numerosSorteo && Array.isArray(p.numerosSorteo)) {
    // 2) Sin historial: mismo matching cruzando picks × sorteo oficial.
    ;({ r2, r3, r4 } = derivarResultado(p.numerosSorteo))

    const pred2 = numeros_2.map((n) => String(n).padStart(2, "0"))
    aciertos_2 = pred2.filter((n) => r2.includes(n)).map((n) => ({ numero: n, puesto: r2.indexOf(n) + 1, tipo: 2 }))

    if (numeros_3.length > 0) {
      const pred3 = numeros_3.map((n) => String(n).padStart(3, "0"))
      aciertos_3 = pred3.filter((n) => r3.includes(n)).map((n) => ({ numero: n, puesto: r3.indexOf(n) + 1, tipo: 3 }))
    }
    if (numeros_4.length > 0) {
      const pred4 = numeros_4.map((n) => String(n).padStart(4, "0"))
      aciertos_4 = pred4.filter((n) => r4.includes(n)).map((n) => ({ numero: n, puesto: r4.indexOf(n) + 1, tipo: 4 }))
    }
  }

  const todos = [...aciertos_2, ...aciertos_3, ...aciertos_4]

  return {
    numeros_2,
    numeros_3,
    numeros_4,
    aciertos_2,
    aciertos_3,
    aciertos_4,
    todos,
    resultado_2: r2,
    resultado_3: r3,
    resultado_4: r4,
    acerto: todos.length > 0,
  }
}
