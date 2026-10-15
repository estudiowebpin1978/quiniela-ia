/**
 * Repositorio de Poceada Federal (Supabase, SOLO server-side con service_role).
 *
 * Reglas no destructivas:
 *  · INSERT que ignora concursos ya existentes (ON CONFLICT DO NOTHING):
 *    nunca sobrescribe un histórico oficial ya registrado.
 *  · La única escritura sobre filas existentes es AGREGAR corroboración
 *    (fuentes/pdf/verificado_en) cuando todavía no estaba corroborada.
 *  · Las predicciones son append-only; sólo se rellena evaluación después.
 *
 * Si la migración 20261015060000_poceada_federal_module.sql todavía no está
 * aplicada, se lanza ErrorMigracionPendiente para que las rutas respondan
 * 503 con diagnóstico honesto (sin fingir datos).
 */

import { getSupabaseAdmin } from "@/lib/supabase-client"
import type {
  EstadoSorteo,
  SorteoPoceadaFederal,
} from "./tipos"

export class ErrorMigracionPendiente extends Error {
  constructor() {
    super("Migración de Poceada Federal no aplicada en Supabase (20261015060000_poceada_federal_module.sql)")
    this.name = "ErrorMigracionPendiente"
  }
}

function esTablaAusente(err: unknown): boolean {
  const s = JSON.stringify(err ?? {})
  return /could not find the table|PGRST205|42P01|poceada_federal_/i.test(s) && /not|find|exist|schema/i.test(s)
}

function manejar(err: unknown): never {
  if (esTablaAusente(err)) throw new ErrorMigracionPendiente()
  throw err instanceof Error ? err : new Error(String(err))
}

interface FilaDraw {
  concurso: number
  fecha: string
  hora: string | null
  numeros: number[]
  fuente: string
  fuentes: string[]
  url_extracto: string | null
  pdf_url: string | null
  corroborado: boolean
  estado: EstadoSorteo
  estado_detalle: string | null
  contenido_hash: string
  publicado_en: string | null
  consultado_en: string
  verificado_en: string | null
  metadatos: Record<string, unknown> | null
}

function aSorteo(f: FilaDraw): SorteoPoceadaFederal {
  return {
    concurso: f.concurso,
    fecha: f.fecha,
    hora: f.hora ?? undefined,
    numeros: f.numeros,
    fuente: f.fuente,
    fuentes: f.fuentes ?? [],
    urlExtracto: f.url_extracto ?? undefined,
    pdfUrl: f.pdf_url ?? undefined,
    corroborado: f.corroborado,
    estado: f.estado,
    estadoDetalle: f.estado_detalle ?? undefined,
    contenidoHash: f.contenido_hash,
    publicadoEn: f.publicado_en ?? undefined,
    consultadoEn: f.consultado_en,
    verificadoEn: f.verificado_en ?? undefined,
    metadatos: f.metadatos ?? undefined,
  }
}

export interface FilaInsertable {
  concurso: number
  fecha: string
  hora?: string
  numeros: number[]
  fuente: string
  fuentes: string[]
  url_extracto?: string
  pdf_url?: string
  corroborado: boolean
  estado: EstadoSorteo
  estado_detalle?: string
  contenido_hash: string
  publicado_en?: string
  consultado_en: string
  verificado_en?: string
  metadatos?: Record<string, unknown>
}

/** Inserta sorteos nuevos; devuelve cuántos se insertaron realmente. */
export async function insertarSorteos(filas: FilaInsertable[]): Promise<number> {
  if (filas.length === 0) return 0
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .upsert(filas, { onConflict: "concurso", ignoreDuplicates: true })
    .select("concurso")
  if (error) manejar(error)
  return data?.length ?? 0
}

/** Agrega corroboración a un sorteo existente aún no corroborado (aditivo). */
export async function agregarCorroboracion(
  concurso: number,
  dato: { fuentes: string[]; pdf_url?: string; url_extracto?: string; verificado_en: string; metadatos?: Record<string, unknown> }
): Promise<boolean> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .update({
      fuentes: dato.fuentes,
      corroborado: true,
      ...(dato.pdf_url ? { pdf_url: dato.pdf_url } : {}),
      ...(dato.url_extracto ? { url_extracto: dato.url_extracto } : {}),
      verificado_en: dato.verificado_en,
      ...(dato.metadatos ? { metadatos: dato.metadatos } : {}),
    })
    .eq("concurso", concurso)
    .eq("corroborado", false)
    .select("concurso")
  if (error) manejar(error)
  return (data?.length ?? 0) > 0
}

/** Concursos existentes en un rango (reanudación del backfill). */
export async function concursosExistentes(desde?: string, hasta?: string): Promise<Set<number>> {
  const sb = getSupabaseAdmin()
  let q = sb.from("poceada_federal_draws").select("concurso, fecha")
  if (desde) q = q.gte("fecha", desde)
  if (hasta) q = q.lte("fecha", hasta)
  const { data, error } = await q
  if (error) manejar(error)
  return new Set((data ?? []).map((r) => Number((r as { concurso: number }).concurso)))
}

export async function mapaExistentes(): Promise<Map<number, SorteoPoceadaFederal>> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .select("*")
    .limit(5000)
  if (error) manejar(error)
  const m = new Map<number, SorteoPoceadaFederal>()
  for (const r of (data ?? []) as FilaDraw[]) m.set(r.concurso, aSorteo(r))
  return m
}

export interface FiltroListado {
  desde?: string
  hasta?: string
  limite?: number
  offset?: number
  soloValidados?: boolean
}

export async function listarSorteos(f: FiltroListado = {}): Promise<SorteoPoceadaFederal[]> {
  const sb = getSupabaseAdmin()
  let q = sb
    .from("poceada_federal_draws")
    .select("*")
    .order("fecha", { ascending: false })
    .order("concurso", { ascending: false })
    .range(f.offset ?? 0, (f.offset ?? 0) + Math.min(f.limite ?? 60, 500) - 1)
  if (f.desde) q = q.gte("fecha", f.desde)
  if (f.hasta) q = q.lte("fecha", f.hasta)
  if (f.soloValidados !== false) q = q.eq("estado", "validated")
  const { data, error } = await q
  if (error) manejar(error)
  return ((data ?? []) as FilaDraw[]).map(aSorteo)
}

/** Historial validado completo en orden cronológico (para el motor). */
export async function historialValidado(limite = 5000): Promise<SorteoPoceadaFederal[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .select("*")
    .eq("estado", "validated")
    .order("fecha", { ascending: true })
    .order("concurso", { ascending: true })
    .limit(limite)
  if (error) manejar(error)
  return ((data ?? []) as FilaDraw[]).map(aSorteo)
}

export async function conteoEstados(): Promise<Record<string, number>> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .select("estado")
    .limit(5000)
  if (error) manejar(error)
  const out: Record<string, number> = { pending: 0, validated: 0, conflict: 0, failed: 0 }
  for (const r of (data ?? []) as { estado: EstadoSorteo }[]) {
    out[r.estado] = (out[r.estado] ?? 0) + 1
  }
  return out
}

export async function ultimoValidado(): Promise<SorteoPoceadaFederal | null> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_draws")
    .select("*")
    .eq("estado", "validated")
    .order("fecha", { ascending: false })
    .order("concurso", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) manejar(error)
  return data ? aSorteo(data as FilaDraw) : null
}

export async function registrarIncidente(
  concurso: number | null,
  tipo: string,
  detalle: Record<string, unknown>
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from("poceada_federal_incidents")
    .insert({ concurso, tipo, detalle })
  if (error) manejar(error)
}

// ─── Predicciones (append-only) ──────────────────────────────────────────────

export interface PrediccionGuardada {
  id: string
  sorteo_objetivo_concurso: number | null
  sorteo_objetivo_confirmado: boolean
  generado_en: string
  historial_corte_fecha: string
  historial_corte_concurso: number
  entrenamiento_count: number
  historial_huella: string
  algoritmo_version: string
  combinaciones: unknown[]
  estado: "pendiente" | "evaluada" | "no_evaluable"
  evaluacion_draw_id: string | null
  evaluacion: Record<string, unknown> | null
  creado_en: string
}

export async function guardarPrediccion(
  p: Omit<PrediccionGuardada, "id" | "creado_en" | "estado" | "evaluacion" | "evaluacion_draw_id"> & {
    estado?: PrediccionGuardada["estado"]
  }
): Promise<string> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_predictions")
    .insert({ ...p, estado: p.estado ?? "pendiente" })
    .select("id")
    .single()
  if (error) manejar(error)
  return String((data as { id: string }).id)
}

export async function listarPredicciones(limite = 10): Promise<PrediccionGuardada[]> {
  const sb = getSupabaseAdmin()
  const { data, error } = await sb
    .from("poceada_federal_predictions")
    .select("*")
    .order("generado_en", { ascending: false })
    .limit(Math.min(limite, 50))
  if (error) manejar(error)
  return (data ?? []) as PrediccionGuardada[]
}

/** Rellena la evaluación (sólo la evaluación: nunca sobrescribe combinaciones). */
export async function marcarEvaluacion(
  id: string,
  drawId: string,
  evaluacion: Record<string, unknown>
): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from("poceada_federal_predictions")
    .update({ estado: "evaluada", evaluacion_draw_id: drawId, evaluacion })
    .eq("id", id)
  if (error) manejar(error)
}

export async function marcarNoEvaluable(id: string, motivo: string): Promise<void> {
  const sb = getSupabaseAdmin()
  const { error } = await sb
    .from("poceada_federal_predictions")
    .update({ estado: "no_evaluable", evaluacion: { motivo } })
    .eq("id", id)
  if (error) manejar(error)
}
