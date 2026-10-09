import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier } from "@/lib/auth/tier"
import { guardarPrediccionBrinco, listarPrediccionesBrinco } from "@/lib/brinco/store"
import { validarCombinacion } from "@/lib/brinco/reglas"
import { BRINCO_ENGINE_VERSION } from "@/lib/brinco/motor"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"

const MODALIDADES = new Set(["tradicional", "junior", "ambos"])

/**
 * GET /api/brinco/historial — lista las predicciones de Brinco del usuario.
 * POST /api/brinco/historial — guarda una jugada (validada en el servidor).
 *
 * Ambas Premium: requieren sesión y `canAccessPremiumFeatures`. El usuario Free
 * es rechazado desde el servidor. La validación de la combinación (6 números
 * distintos 00-39) se hace SIEMPRE aquí, sin confiar en el cliente.
 */

export async function GET(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
    if (!token) {
      return NextResponse.json({ error: "Autenticación requerida", upgradeRequired: true }, { status: 401 })
    }
    const tier = await resolveUserTier(token)
    if (!tier.canAccessPremiumFeatures || !tier.userId) {
      return NextResponse.json(
        { error: "Brinco es una función Premium", tier: tier.role, upgradeRequired: true },
        { status: 403 },
      )
    }
    const { searchParams } = new URL(req.url)
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10) || 50))
    const rows = await listarPrediccionesBrinco(tier.userId, limit)
    return NextResponse.json({ ok: true, total: rows.length, historial: rows })
  } catch (e) {
    logger.error("[brinco/historial] GET error", { error: String(e) })
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
    if (!token) {
      return NextResponse.json({ error: "Autenticación requerida", upgradeRequired: true }, { status: 401 })
    }
    const tier = await resolveUserTier(token)
    if (!tier.canAccessPremiumFeatures || !tier.userId) {
      return NextResponse.json(
        { error: "Brinco es una función Premium", tier: tier.role, upgradeRequired: true },
        { status: 403 },
      )
    }

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "Cuerpo inválido" }, { status: 400 })
    }

    const concurso = Number.parseInt(String((body as Record<string, unknown>).concurso_objetivo), 10)
    if (!Number.isFinite(concurso) || concurso <= 0) {
      return NextResponse.json({ ok: false, error: "concurso_objetivo inválido" }, { status: 400 })
    }
    const modalidad = String((body as Record<string, unknown>).modalidad || "ambos")
    if (!MODALIDADES.has(modalidad)) {
      return NextResponse.json({ ok: false, error: "modalidad inválida (tradicional|junior|ambos)" }, { status: 400 })
    }

    const numeros = (body as Record<string, unknown>).numeros
    const validacion = validarCombinacion(numeros)
    if (!validacion.ok) {
      return NextResponse.json(
        { ok: false, error: "Combinación inválida", detalle: validacion.errores },
        { status: 400 },
      )
    }

    const fechaObjetivo = (body as Record<string, unknown>).fecha_objetivo
      ? String((body as Record<string, unknown>).fecha_objetivo)
      : null

    const res = await guardarPrediccionBrinco({
      user_id: tier.userId,
      concurso_objetivo: concurso,
      fecha_objetivo: fechaObjetivo,
      modalidad,
      numeros: numeros as number[],
      scores: (body as Record<string, unknown>).scores ?? [],
      factores: (body as Record<string, unknown>).factores ?? {},
      engine_version: BRINCO_ENGINE_VERSION,
      n_historico: Number((body as Record<string, unknown>).n_historico || 0),
      datos_hasta: (body as Record<string, unknown>).datos_hasta
        ? String((body as Record<string, unknown>).datos_hasta)
        : null,
      estado: "generada",
      aciertos_tradicional: null,
      aciertos_junior: null,
    })

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: "No se pudo guardar la predicción" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, id: res.id })
  } catch (e) {
    logger.error("[brinco/historial] POST error", { error: String(e) })
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
