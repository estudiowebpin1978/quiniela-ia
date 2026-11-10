/**
 * Actualización del historial desde las fuentes oficiales (LOTBA).
 *
 * Genérico sobre la fecha: reescrapea cualquier fecha pasada que aún no tenga
 * sorteo en `draws` (garantiza acertios automáticos vía verify_predictions_for_draw).
 * Fail-soft siempre: cualquier paso roto aborta salvate without raising.
 *
 * Superficie:
 *   refrescarTurnoOnDemand(turno, fechaISO)  - UN turno+fecha (idempotente)
 *   rellenarHistoricoDeTurno(turno, días)    - barre los últimos N días y completa vacíos
 *   rellenarTodoHistorico(días)              - barrido por turno (auditoría/CLI)
 *
 * Límites:
 *   - Ventana 30 días por defecto (over qué, añadir admin/backfill)
 *   - Respeta horario oficial + 2 min buffer, feriados y domingos sin sorteo
 *   - No sirve de nada para fechas futuras (antes del sorteo): retorna skipped
 */
import { esDiaSinSorteo, esTurnoSinSorteo } from "@/lib/feriados"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { fetchQuinielaDraw, fetchPoceadaDrawOficial, SOURCE_LOTBA } from "@/lib/scrapers/lotba-oficial"
import { fetchWithConsensus } from "@/lib/scrapers/consensus"
import { TURNOS, type TurnoType, type SourceStats, GAME_ID } from "@/lib/scrapers/types"
import { POCEADA_GAME_ID } from "@/lib/config"
import { LOTBA } from "@/lib/config/lotba"
import { invalidateAllPredictionCaches } from "@/lib/cache/prediction-cache-invalidation"
import logger from "@/lib/logger"

export interface ResultadoRefreshTurno {
  status: "skipped" | "fresh" | "saved" | "error"
  detail?: string
}
export interface ReporteHistorico {
  turno: string
  totalDias: number
  fresh: number
  saved: number
  skipped: number
  errores: number
  detalle: ResultadoRefreshTurno[]
}

const OFFICIAL_TIME_ART: Record<string, string> = {
  Previa: "10:30",
  Primera: "12:30",
  Matutina: "15:00",
  Vespertina: "18:30",
  Nocturna: "21:30",
  Poceada: "21:15",
}
const BUFFER_MS = 2 * 60 * 1000
const VENTANA_HIST_DIAS = 30

function hoyArt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
}
function isoMenos(dateISO: string, dias: number): string {
  const d = new Date(`${dateISO}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - dias)
  return d.toISOString().slice(0, 10)
}
function calendarioMenos(hoy: string, dias: number): string[] {
  const out: string[] = []
  for (let i = 0; i < dias; i++) out.push(isoMenos(hoy, i))
  return out
}
function diaSemanaArt(fechaISO: string): number {
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay()
}
function urlDateFromISO(fechaISO: string): string {
  const [yyyy, mm, dd] = fechaISO.split("-"); return `${dd}-${mm}-${yyyy.slice(-2)}`
}
function cutoffArt(fechaISO: string, turno: string): number {
  const hm = OFFICIAL_TIME_ART[turno] ?? "00:00"
  const [h, m] = hm.split(":").map(Number)
  return new Date(`${fechaISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`).getTime() + BUFFER_MS
}

async function tieneDraw(turno: string, fechaISO: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from("draws").select("id").eq("turno", turno).eq("date", fechaISO).limit(1)
  return Array.isArray(data) && data.length > 0
}
async function guardarDrawIdempotente(turno: string, fechaISO: string, nums: number[], source: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()
  const { error } = await supabase.rpc("upsert_draw" as never, {
    p_date: fechaISO, p_turno: turno, p_numbers: nums, p_source: source,
    p_game_id: turno === "Poceada" ? POCEADA_GAME_ID : GAME_ID,
    p_jurisdiccion: LOTBA.jurisdiction,
  } as never)
  if (error) return { ok: false, error: error.message }
  try {
    // Verifica automáticamente las predicciones pendientes para este sorteo
    await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
      p_date: fechaISO, p_turno: turno,
    } as never)
  } catch (e) {
    logger.warn("[refresh-on-demand] verify exception", { error: String(e), turno })
  }
  return { ok: true }
}

/** Un solo (turno, fecha) genérico. No sirve de nada si ya existe. */
export async function refrescarTurnoOnDemand(turno: string, fechaISO: string): Promise<ResultadoRefreshTurno> {
  try {
    if (!OFFICIAL_TIME_ART[turno]) return { status: "skipped", detail: "turno_desconocido" }
    if (!TURNOS.includes(turno as TurnoType)) return { status: "skipped", detail: "turno_no_valido" }

    const diaSemana = diaSemanaArt(fechaISO)
    if (esDiaSinSorteo(fechaISO, diaSemana)) return { status: "skipped", detail: "sin_sorteos" }
    if (esTurnoSinSorteo(fechaISO, turno)) return { status: "skipped", detail: "sin_sorteo_turno" }

    if (await tieneDraw(turno, fechaISO)) return { status: "fresh" }

    // Guardar sólo después del inicio oficial + margen (protege solapamiento hoy)
    if (Date.now() < cutoffArt(fechaISO, turno)) return { status: "skipped", detail: "antes_del_sorteo" }

    const fechaUrl = urlDateFromISO(fechaISO)
    const stats: SourceStats = {}
    let nums: number[] | null = null
    let source = "consensus"

    if (turno === "Poceada") {
      const numsOficial = await fetchPoceadaDrawOficial(fechaISO).catch(() => null)
      if (numsOficial?.length === 20) { nums = numsOficial; source = SOURCE_LOTBA }
    }
    if (!nums) {
      const consensus = await fetchWithConsensus(fechaISO, fechaUrl, turno as TurnoType, stats).catch(() => null)
      if (consensus?.numbers && consensus.numbers.length === 20 && consensus.ok) {
        nums = consensus.numbers; source = consensus.source || "consensus"
      } else if (turno !== "Poceada") {
        const oficial = await fetchQuinielaDraw(fechaISO, turno as TurnoType).catch(() => null)
        if (oficial && oficial.length >= 20) { nums = oficial; source = SOURCE_LOTBA }
      }
    }
    if (!nums || nums.length < 20) return { status: "error", detail: "sin_datos_suficientes" }

    const save = await guardarDrawIdempotente(turno, fechaISO, nums, source)
    if (!save.ok) return { status: "error", detail: save.error }
    await invalidateAllPredictionCaches().catch(() => {})

    // Event-driven: dispara precompute del turno (fire-and-forget)
    try {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.NEXT_PUBLIC_APP_URL || "https://quiniela-ia-two.vercel.app"
      const cronKey = process.env.CRON_SECRET || ""
      fetch(`${baseUrl}/api/cron-precompute?turno=${encodeURIComponent(turno)}`, {
        headers: { Authorization: `Bearer ${cronKey}` },
      }).catch(() => {})
    } catch { /* no-fatal */ }

    logger.info("[refresh-on-demand] draw saved", { fecha: fechaISO, turno, source })
    return { status: "saved" }
  } catch (e) {
    logger.error("[refresh-on-demand] exception", { error: String(e), turno, fechaISO })
    return { status: "error", detail: String(e) }
  }
}

/**
 * Barrel-scan de los últimos `windowDays` días para el turno y completa
 * cualquier sorteo faltante. Idempotente. Devuelve resumen para auditoría.
 * NO bloquea la respuesta del caller: usar vaciado (`void`) en lectores.
 */
export async function rellenarHistoricoDeTurno(turno: string, windowDays = VENTANA_HIST_DIAS): Promise<ReporteHistorico> {
  const resumen: ReporteHistorico = { turno, totalDias: 0, fresh: 0, saved: 0, skipped: 0, errores: 0, detalle: [] }
  if (!TURNOS.includes(turno as TurnoType)) { resumen.skipped++; return resumen }
  const hoy = hoyArt()
  for (const fechaISO of calendarioMenos(hoy, windowDays)) {
    resumen.totalDias++
    const r = await refrescarTurnoOnDemand(turno, fechaISO)
    resumen.detalle.push(r)
    resumen[r.status === "fresh" ? "fresh" : r.status === "saved" ? "saved" : r.status === "error" ? "errores" : "skipped"]++
  }
  return resumen
}

/** Barrido completo para auditoría: todos los turnos. Retorna por turno. */
export async function rellenarTodoHistorico(windowDays = VENTANA_HIST_DIAS): Promise<ReporteHistorico[]> {
  const todos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"] as const
  const out: ReporteHistorico[] = []
  for (const turno of todos) out.push(await rellenarHistoricoDeTurno(turno, windowDays))
  return out
}
