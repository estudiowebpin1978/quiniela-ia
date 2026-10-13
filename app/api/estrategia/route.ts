import { NextRequest, NextResponse } from "next/server"
import { tablaEVQuiniela, resumenEVQuiniela, estructuraPoceada, APUESTA_MINIMA_LOTBA, FUENTE_PREMIOS } from "@/lib/estrategia/premios-lotba"
import logger from "@/lib/logger"

/**
 * GET /api/estrategia — Valor Esperado (EV) honesto de la Quiniela de la Ciudad.
 *
 * Cálculo PURO (sin DB ni datos de usuario): combina la tabla de premios
 * OFICIAL de LOTBA (Programación Mensual oficial oct-2026 + Reglamento Res.
 * Dir. 32/2018 — verificada 2026-10-13) con probabilidades EXACTAS de azar.
 * No promete ventaja sobre el azar: el EV es casi siempre NEGATIVO (borde de
 * la casa) y eso se muestra sin maquillaje.
 *
 * Público a propósito: son datos regulatorios + matemática, sin información
 * personal. Poceada queda fuera (pendiente de transcribir de la programación
 * oficial, sin datos inventados).
 */

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const apuesta = parseInt(searchParams.get("apuesta") || String(APUESTA_MINIMA_LOTBA), 10)

    // Validación: mínimo oficial $150 (programación LOTBA); 5000 es un límite
    // operativo del endpoint (la programación no publica máximo para Quiniela)
    if (!Number.isFinite(apuesta) || apuesta < APUESTA_MINIMA_LOTBA || apuesta > 5000) {
      return NextResponse.json(
        { error: `apuesta debe estar entre ${APUESTA_MINIMA_LOTBA} (mínimo oficial LOTBA) y 5000 (límite operativo de este endpoint)` },
        { status: 400 },
      )
    }

    const resumen = resumenEVQuiniela(apuesta)

    return NextResponse.json({
      ok: true,
      juego: "Quiniela de la Ciudad (LOTBA)",
      fuente: FUENTE_PREMIOS,
      apuesta,
      modalidades: resumen.tabla,
      resumen: {
        peorEV: resumen.peorEV,
        mejorEV: resumen.mejorEV,
        observacion: resumen.observacion,
      },
      poceada: estructuraPoceada(),
      aviso_legal:
        "Análisis estadístico con fines informativos. La lotería es un evento aleatorio e independiente. " +
        "El valor esperado de casi todas las apuestas es negativo (borde de la casa). No se garantiza ningún resultado. Jugar con responsabilidad.",
    })
  } catch (e) {
    logger.error("[estrategia] error calculando EV", { error: String(e) })
    return NextResponse.json({ ok: false, error: "Error interno calculando EV" }, { status: 500 })
  }
}
