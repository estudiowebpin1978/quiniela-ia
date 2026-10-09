/**
 * Persistencia del Brinco en Supabase (service-role, server-side).
 * Implementa `BrincoStore` para el importador y agrega helpers de lectura y
 * escritura de predicciones. Aislado de las tablas de la Quiniela.
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import type { BrincoDrawRow, BrincoStore } from "@/lib/brinco/importar"
import type { EstadoVerificacion } from "@/lib/brinco/reglas"
import type { SorteoBrinco } from "@/lib/brinco/backtest"
import logger from "@/lib/logger"

interface DrawDbRow {
  concurso: number
  fecha: string
  tradicional: number[]
  junior: number[] | null
  reglas_junior: string
  estado_verificacion: EstadoVerificacion
  fuente: string
  url: string
  metadatos: Record<string, unknown> | null
  importado_en: string
  ultimo_intento: string
  verificado_en: string | null
}

function aDrawRow(r: DrawDbRow): BrincoDrawRow {
  return {
    concurso: r.concurso,
    fecha: r.fecha,
    tradicional: r.tradicional,
    junior: r.junior ?? null,
    reglas_junior: r.reglas_junior,
    estado_verificacion: r.estado_verificacion,
    fuente: r.fuente,
    url: r.url,
    metadatos: r.metadatos ?? {},
    importado_en: r.importado_en,
    ultimo_intento: r.ultimo_intento,
    verificado_en: r.verificado_en,
  }
}

/** Store real de Supabase para el importador. */
export function brincoStoreSupabase(): BrincoStore {
  const sb = getSupabaseAdmin()
  return {
    async getByConcurso(concurso) {
      const { data, error } = await sb
        .from("brinco_draws")
        .select("*")
        .eq("concurso", concurso)
        .limit(1)
      if (error) {
        logger.warn("[brinco-store] getByConcurso error", { concurso, error: error.message })
        return null
      }
      const row = (data as DrawDbRow[] | null)?.[0]
      return row ? aDrawRow(row) : null
    },
    async getByFecha(fecha) {
      const { data, error } = await sb
        .from("brinco_draws")
        .select("*")
        .eq("fecha", fecha)
        .limit(1)
      if (error) {
        logger.warn("[brinco-store] getByFecha error", { fecha, error: error.message })
        return null
      }
      const row = (data as DrawDbRow[] | null)?.[0]
      return row ? aDrawRow(row) : null
    },
    async insertOrIgnore(row) {
      const { error } = await sb.from("brinco_draws").upsert(row, {
        onConflict: "concurso",
        ignoreDuplicates: true,
      })
      if (error) {
        // Duplicado u otro error: tratamos como omitido y logueamos.
        logger.warn("[brinco-store] insertOrIgnore", { concurso: row.concurso, error: error.message })
        return "omitido"
      }
      return "insertado"
    },
  }
}

/** Carga todos los sorteos ordenados por concurso (para motor/backtest). */
export async function cargarSorteosBrinco(): Promise<SorteoBrinco[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_draws")
    .select("concurso,fecha,tradicional,junior")
    .order("concurso", { ascending: true })
  if (error) {
    logger.warn("[brinco-store] cargarSorteos error", { error: error.message })
    return []
  }
  return ((data as unknown[]) as Array<{ concurso: number; fecha: string; tradicional: number[]; junior: number[] | null }>) ?? []
}

/** Máximo concurso almacenado (para update incremental). */
export async function maxConcursoBrinco(): Promise<number | null> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_draws")
    .select("concurso")
    .order("concurso", { ascending: false })
    .limit(1)
  if (error) return null
  const row = (data as Array<{ concurso: number }> | null)?.[0]
  return row ? row.concurso : null
}

/** Última fecha almacenada (para mostrar "datos hasta"). */
export async function ultimaFechaBrinco(): Promise<string | null> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_draws")
    .select("fecha")
    .order("fecha", { ascending: false })
    .limit(1)
  if (error) return null
  const row = (data as Array<{ fecha: string }> | null)?.[0]
  return row ? row.fecha : null
}

// ─── Predicciones ───────────────────────────────────────────────────────────

export interface PrediccionBrincoRow {
  id?: string
  user_id: string
  concurso_objetivo: number
  fecha_objetivo: string | null
  modalidad: string
  numeros: number[]
  scores?: unknown
  factores?: unknown
  engine_version: string
  n_historico: number
  datos_hasta: string | null
  estado: string
  aciertos_tradicional: number | null
  aciertos_junior: number | null
  metrics?: unknown
  created_at?: string
}

/** Guarda una predicción (idempotente por usuario+concurso+modalidad). */
export async function guardarPrediccionBrinco(row: PrediccionBrincoRow): Promise<{ ok: boolean; id?: string; error?: string }> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_predictions")
    .upsert(row, { onConflict: "user_id,concurso_objetivo,modalidad", ignoreDuplicates: false })
    .select("id")
    .limit(1)
  if (error) {
    logger.warn("[brinco-store] guardarPrediccion error", { error: error.message })
    return { ok: false, error: error.message }
  }
  const id = (data as Array<{ id: string }> | null)?.[0]?.id
  return { ok: true, id }
}

/** Lista predicciones de un usuario (más recientes primero). */
export async function listarPrediccionesBrinco(userId: string, limit = 50): Promise<PrediccionBrincoRow[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_predictions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)
  if (error) {
    logger.warn("[brinco-store] listarPredicciones error", { error: error.message })
    return []
  }
  return (data as PrediccionBrincoRow[]) ?? []
}

/** Busca un sorteo por su número de concurso. */
export async function buscarSorteoPorConcurso(concurso: number): Promise<SorteoBrinco | null> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_draws")
    .select("concurso,fecha,tradicional,junior")
    .eq("concurso", concurso)
    .limit(1)
  if (error) return null
  return ((data as SorteoBrinco[] | null)?.[0]) ?? null
}

/** Predicciones aún sin aciertos de Tradicional (pendientes de verificación). */
export async function prediccionesPendientesVerificacion(limit = 500): Promise<PrediccionBrincoRow[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("brinco_predictions")
    .select("*")
    .is("aciertos_tradicional", null)
    .order("concurso_objetivo", { ascending: true })
    .limit(limit)
  if (error) {
    logger.warn("[brinco-store] pendientes error", { error: error.message })
    return []
  }
  return (data as PrediccionBrincoRow[]) ?? []
}

/** Marca una predicción como verificada con sus aciertos por modalidad. */
export async function marcarVerificada(
  id: string,
  patch: {
    aciertos_tradicional: number | null
    aciertos_junior: number | null
    resultado_oficial: unknown
    estado: string
  },
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb.from("brinco_predictions").update(patch).eq("id", id)
  if (error) logger.warn("[brinco-store] marcarVerificada error", { id, error: error.message })
}
