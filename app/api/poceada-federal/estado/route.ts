import { NextRequest, NextResponse } from "next/server"
import {
  conteoEstados,
  historialValidado,
  ultimoValidado,
  ErrorMigracionPendiente,
} from "@/lib/poceada-federal/repositorio"

export const dynamic = "force-dynamic"

/**
 * GET /api/poceada-federal/estado — estado de la sincronización y cobertura
 * del historial oficial. Sólo lectura, sin secretos.
 */
export async function GET(_req: NextRequest) {
  try {
    const [conteos, historial, ultimo] = await Promise.all([
      conteoEstados(),
      historialValidado(),
      ultimoValidado(),
    ])

    const fechas = historial.map((s) => s.fecha).sort()
    const brechas: { desde: string; hasta: string; dias: number }[] = []
    for (let i = 1; i < fechas.length; i++) {
      const a = new Date(`${fechas[i - 1]}T12:00:00Z`).getTime()
      const b = new Date(`${fechas[i]}T12:00:00Z`).getTime()
      const dias = Math.round((b - a) / 864e5)
      if (dias > 4) brechas.push({ desde: fechas[i - 1], hasta: fechas[i], dias })
    }

    const ahora = Date.now()
    const ultimaConsulta = ultimo ? Date.parse(ultimo.consultadoEn) : NaN
    const antiguedadHoras = Number.isFinite(ultimaConsulta)
      ? Math.round((ahora - ultimaConsulta) / 36e5)
      : null

    return NextResponse.json({
      ok: true,
      conteoPorEstado: conteos,
      cobertura: {
        cantidadValidados: historial.length,
        primeraFecha: fechas[0] ?? null,
        ultimaFecha: fechas[fechas.length - 1] ?? null,
        fuenteHistorial:
          "IAFAS oficial (servicios.iafas.gov.ar) — listado verificado disponible desde 2021-06-22; antes no hay datos oficiales consultables",
        brechasMayores4Dias: brechas,
      },
      ultimoValidado: ultimo
        ? { concurso: ultimo.concurso, fecha: ultimo.fecha, corroborado: ultimo.corroborado }
        : null,
      sincronizacion: { ultimaConsulta: ultimo?.consultadoEn ?? null, antiguedadHoras },
    })
  } catch (e) {
    if (e instanceof ErrorMigracionPendiente) {
      return NextResponse.json(
        { ok: false, error: "migracion_pendiente", detalle: e.message },
        { status: 503 }
      )
    }
    return NextResponse.json({ ok: false, error: "error_interno" }, { status: 500 })
  }
}
