import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { actualizarIncrementalBrinco } from "@/lib/brinco/actualizar"
import { cargarSorteosBrinco, maxConcursoBrinco } from "@/lib/brinco/store"
import { generarPrediccionBrinco, type ModalidadBrinco, type PrediccionBrinco } from "@/lib/brinco/motor"
import { hashSeed } from "@/lib/math/seeded-rng"
import { BRINCO_GAME_ID } from "@/lib/brinco/reglas"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

/**
 * GET /api/brinco/prediccion — genera una jugada Premium de Brinco (6 de 40).
 *
 * Protección Premium en el servidor (no se confía en el frontend): requiere
 * Bearer token de sesión y `canAccessPremiumFeatures` (premium/admin). Rechaza
 * usuarios Free desde el servidor.
 *
 * Antes de generar, hace una actualización INCREMENTAL breve (cacheada) para
 * detectar sorteos faltantes sin re-descargar el historial completo. Determinista:
 * misma historia + mismo concurso objetivo → misma jugada.
 */

// La jugada es idéntica para todos (pública): cache global corto para no
// repetir scraping ante varios usuarios simultáneos.
interface CacheEntry {
  ts: number
  payload: unknown
}
const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL = 5 * 60 * 1000

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
    if (!token) {
      return NextResponse.json(
        { error: "Autenticación requerida", upgradeRequired: true },
        { status: 401 },
      )
    }
    const tier = await resolveUserTier(token)
    if (!tier.canAccessPremiumFeatures) {
      return NextResponse.json(
        {
          error: "Brinco es una función Premium",
          trialExpired: tier.trialExpired,
          tier: tier.role,
          upgradeRequired: true,
        },
        { status: 403 },
      )
    }

    const { searchParams } = new URL(req.url)
    const modalidadParam = searchParams.get("modalidad") || "ambos"
    const modalidad: ModalidadBrinco = modalidadParam === "junior" ? "junior" : "tradicional"

    const cacheKey = "brinco:prediccion"
    const hit = CACHE.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) {
      return NextResponse.json(hit.payload)
    }

    // 1. Actualización incremental (breve): detecta sorteos faltantes.
    const { estado } = await actualizarIncrementalBrinco({ domingos: 3, apply: true })

    // 2. Cargar historia validada.
    const sorteos = await cargarSorteosBrinco()
    if (sorteos.length === 0) {
      const payload = {
        ok: false,
        error: "Sin historial de Brinco disponible",
        sincronizacion: estado,
        aviso:
          "No hay sorteos de Brinco importados todavía. El historial se carga desde la fuente oficial " +
          "(cas.gob.ar). Intentá de nuevo más tarde.",
      }
      CACHE.set(cacheKey, { ts: Date.now(), payload })
      return NextResponse.json(payload, { status: 503 })
    }

    const maxConcurso = (await maxConcursoBrinco()) ?? sorteos[sorteos.length - 1].concurso
    const concursoObjetivo = maxConcurso + 1
    const datosHasta = sorteos[sorteos.length - 1].fecha

    const historialTradicional = sorteos.map((s) => s.tradicional)
    const historialJunior = sorteos.filter((s) => Array.isArray(s.junior)).map((s) => s.junior as number[])

    const predTradicional: PrediccionBrinco = generarPrediccionBrinco(
      "tradicional",
      historialTradicional,
      { semilla: hashSeed("brinco", concursoObjetivo, "trad"), alternativas: 2 },
      datosHasta,
    )
    const predJunior: PrediccionBrinco | null =
      historialJunior.length >= 3
        ? generarPrediccionBrinco(
            "junior",
            historialJunior,
            { semilla: hashSeed("brinco", concursoObjetivo, "junior"), alternativas: 2 },
            datosHasta,
          )
        : null

    const payload = {
      ok: true,
      juego: "Brinco (Lotería de Santa Fe)",
      gameId: BRINCO_GAME_ID,
      reglas: "6 números distintos del 00 al 39. El orden no importa. Misma jugada participa de Tradicional y Junior.",
      modalidadSolicitada: modalidad,
      concursoObjetivo,
      datosHasta,
      sorteosTotales: sorteos.length,
      sincronizacion: estado,
      tradicional: predTradicional,
      junior: predJunior,
      juniorNota:
        historialJunior.length < 3
          ? "Junior: historial insuficiente (<3 sorteos) para generar una jugada fundamentada."
          : "Junior: sorteo adicional (Siempre Sale) evaluado con la misma jugada.",
    }

    CACHE.set(cacheKey, { ts: Date.now(), payload })
    return NextResponse.json(payload)
  } catch (e) {
    logger.error("[brinco/prediccion] error", { error: String(e) })
    return NextResponse.json({ ok: false, error: "Error interno generando la jugada" }, { status: 500 })
  }
}
