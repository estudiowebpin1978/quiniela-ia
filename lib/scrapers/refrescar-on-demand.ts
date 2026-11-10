/**
 * Actualización on-demand del historial desde las fuentes oficiales.
 *
 * Se usa cuando se pide una predicción y ese sorteo aún no está en la base
 * de sorteos (p. ej. la web de lotería lo publica antes que el próximo tick
 * de cron-job.org, o se omite un sorteo). Es el equivalente determinista de
 * una corrida de `/api/cron-scrape?turno=Turno&date=YYYY-MM-DD`, acotado a UN
 * turno y UNA fecha para el camino de lectura, y SIEMPRE fail-soft: si el
 * scrape falla o está fuera de horario, retorna "skipped" y el flujo sigue
 * con el comportamiento previo (cache o cálculo en vivo).
 *
 * Optimizado para la ruta frecuente:
 *  - No hace nada si `fechaISO` no es HOY (el historial pasado no se
 *    re-escrapea desde un request de sólo lectura).
 *  - No hace nada si el turno ya tiene sorteo guardado para esa fecha (1 SELECT).
 *  - No hace nada antes del horario oficial del sorteo + 2 min de margen.
 *  - Idempotente: el upsert corre siempre por clave (fecha, turno).
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

/** Horario oficial del sorteo en ART (America/Argentina/Buenos_Aires, UTC-3). */
const OFFICIAL_TIME_ART: Record<string, string> = {
  Previa: "10:30",
  Primera: "12:30",
  Matutina: "15:00",
  Vespertina: "18:30",
  Nocturna: "21:30",
  Poceada: "21:15",
}

const BUFFER_MS = 2 * 60 * 1000 // margen tras el inicio oficial antes de intentar scrape

function hoyArt(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format()
}

function diaSemanaArt(fechaISO: string): number {
  // fechaISO es "YYYY-MM-DD"; mediodía para evitar vuelta de día por TZ
  return new Date(`${fechaISO}T12:00:00Z`).getUTCDay()
}

function urlDateFromISO(fechaISO: string): string {
  const [yyyy, mm, dd] = fechaISO.split("-")
  return `${dd}-${mm}-${yyyy.slice(-2)}`
}

async function tieneDraw(turno: string, fechaISO: string): Promise<boolean> {
  const supabase = getSupabaseAdmin()
  const { data } = await supabase
    .from("draws")
    .select("id")
    .eq("turno", turno)
    .eq("date", fechaISO)
    .limit(1)
  return Array.isArray(data) && data.length > 0
}

async function guardarDrawIdempotente(turno: string, fechaISO: string, nums: number[], source: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin()
  const gameId = turno === "Poceada" ? POCEADA_GAME_ID : GAME_ID
  const jurisdiccion = LOTBA.jurisdiction
  const { error } = await supabase.rpc("upsert_draw" as never, {
    p_date: fechaISO,
    p_turno: turno,
    p_numbers: nums,
    p_source: source,
    p_game_id: gameId,
    p_jurisdiccion: jurisdiccion,
  } as never)
  if (error) return { ok: false, error: error.message }

  // Verificación atómica de predicciones pendientes (best-effort, como el cron)
  try {
    await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
      p_date: fechaISO,
      p_turno: turno,
    } as never)
  } catch (e) {
    logger.warn("[refresh-on-demand] verify exception", { error: String(e), turno })
  }
  return { ok: true }
}

/**
 * Reescrapea el sorteo de `turno` para `fechaISO`. Pensada para el camino de
 * lectura de predicciones: retorna rápido si no corresponde, y si el sorteo
 * sigue sin publicarse se da por agotada la ventana de espera.
 */
export async function refrescarTurnoOnDemand(turno: string, fechaISO: string): Promise<ResultadoRefreshTurno> {
  try {
    if (!OFFICIAL_TIME_ART[turno]) return { status: "skipped", detail: "turno_desconocido" }
    if (!TURNOS.includes(turno as TurnoType)) return { status: "skipped", detail: "turno_no_valido" }

    // Sólo hoy: el historial anterior no se re-scrapea desde un GET de usuario
    const hoy = hoyArt()
    if (fechaISO !== hoy) return { status: "skipped", detail: "solo_hoy" }

    const diaSemana = diaSemanaArt(fechaISO)
    if (esDiaSinSorteo(fechaISO, diaSemana)) return { status: "skipped", detail: "sin_sorteos" }
    if (esTurnoSinSorteo(fechaISO, turno)) return { status: "skipped", detail: "sin_sorteo_turno" }

    if (await tieneDraw(turno, fechaISO)) return { status: "fresh" }

    // Time guard: sólo después del inicio oficial + margen
    const [h, m] = (OFFICIAL_TIME_ART[turno] || "00:00").split(":").map(Number)
    const cutoff = new Date(`${fechaISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-03:00`).getTime() + BUFFER_MS
    if (Date.now() < cutoff) return { status: "skipped", detail: "antes_del_sorteo" }

    // Fuentes: - quiniela turns => dual consensus (with official fallback)
    //          - Poceada         => home+list oficial LOTBA (mismos módulos que cron)
    const fechaUrl = urlDateFromISO(fechaISO)
    const stats: SourceStats = {}
    let nums: number[] | null = null
    let source = "consensus"

    if (turno === "Poceada") {
      const numsOficial = await fetchPoceadaDrawOficial(fechaISO).catch(() => null)
      if (numsOficial && numsOficial.length === 20) {
        nums = numsOficial
        source = SOURCE_LOTBA
      }
    }
    if (!nums) {
      let consensus: Awaited<ReturnType<typeof fetchWithConsensus>> | null = null
      try {
        consensus = await fetchWithConsensus(fechaISO, fechaUrl, turno as TurnoType, stats)
      } catch (e) {
        logger.warn("[refresh-on-demand] consensus exception", { error: String(e), turno })
      }
      if (consensus && Array.isArray(consensus.numbers) && consensus.numbers.length === 20 && consensus.ok) {
        nums = consensus.numbers
        source = consensus.source || "consensus"
      } else if (turno === "Poceada") {
        // fallback central ya probado
      } else {
        const oficial = await fetchQuinielaDraw(fechaISO, turno as TurnoType).catch(() => null)
        if (oficial && oficial.length >= 20) {
          nums = oficial
          source = SOURCE_LOTBA
        }
      }
    }

    if (!nums || nums.length < 20) {
      return { status: "error", detail: "sin_datos_suficientes" }
    }

    const save = await guardarDrawIdempotente(turno, fechaISO, nums, source)
    if (!save.ok) return { status: "error", detail: save.error }

    await invalidateAllPredictionCaches().catch(() => {})

    // Event-driven: disparar precompute del propio turno best-effort (fire-and-forget)
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
