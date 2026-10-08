import { NextRequest, NextResponse } from "next/server"
import { tablaEVQuiniela, resumenEVQuiniela, APUESTA_MINIMA_LOTBA, FUENTE_PREMIOS } from "@/lib/estrategia/premios-lotba"
import logger from "@/lib/logger"

/**
 * GET /api/estrategia — Valor Esperado (EV) honesto de la Quiniela Provincial.
 *
 * Cálculo PURO (sin DB ni datos de usuario): combina la tabla de premios
 * OFICIAL de LOTBA (Resolución 1992-2018 Art. 18, verificada 2026-10-08) con
 * probabilidades EXACTAS de azar. No promete ventaja sobre el azar: el EV es
 * casi siempre NEGATIVO (borde de la casa) y eso se muestra sin maquillaje.
 *
 * Público a propósito: son datos regulatorios + matemática, sin información
 * personal. Poceada queda fuera (premios de pozo/parimutuel, pendientes).
 */

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const apuesta = parseInt(searchParams.get("apuesta") || String(APUESTA_MINIMA_LOTBA), 10)

    // Validación: apuesta dentro de límites oficiales ($100 mín, $5000 máx)
    if (!Number.isFinite(apuesta) || apuesta < APUESTA_MINIMA_LOTBA || apuesta > 5000) {
      return NextResponse.json(
        { error: `apuesta debe estar entre ${APUESTA_MINIMA_LOTBA} y 5000 (límites oficiales LOTBA)` },
        { status: 400 },
      )
    }

    const resumen = resumenEVQuiniela(apuesta)

    return NextResponse.json({
      ok: true,
      juego: "Quiniela Provincial (LOTBA)",
      fuente: FUENTE_PREMIOS,
      apuesta,
      modalidades: resumen.tabla,
      resumen: {
        peorEV: resumen.peorEV,
        mejorEV: resumen.mejorEV,
        observacion: resumen.observacion,
      },
      pendiente: {
        poceada:
          "Poceada no incluida: sus premios son POZO/parimutuel (varían por sorteo) y requieren programa de premios oficial aparte.",
      },
      aviso_legal:
        "Análisis estadístico con fines informativos. La lotería es un evento aleatorio e independiente. " +
        "El valor esperado de casi todas las apuestas es negativo (borde de la casa). No se garantiza ningún resultado. Jugar con responsabilidad.",
    })
  } catch (e) {
    logger.error("[estrategia] error calculando EV", { error: String(e) })
    return NextResponse.json({ ok: false, error: "Error interno calculando EV" }, { status: 500 })
  }
}
