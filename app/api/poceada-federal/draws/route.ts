import { NextRequest, NextResponse } from "next/server"
import { listarSorteos, ErrorMigracionPendiente } from "@/lib/poceada-federal/repositorio"

export const dynamic = "force-dynamic"

/**
 * GET /api/poceada-federal/draws — lectura PÚBLICA de sorteos oficiales
 * validados de Poceada Federal (sin secretos, paginada).
 *
 * Query: ?desde=yyyy-mm-dd&hasta=yyyy-mm-dd&limit=1..500&offset=0
 * Por defecto sólo estado=validated. No expone administración ni trazas.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams
  const limit = Math.max(1, Math.min(500, Number(q.get("limit") ?? "60") || 60))
  const offset = Math.max(0, Number(q.get("offset") ?? "0") || 0)
  const desde = q.get("desde") ?? undefined
  const hasta = q.get("hasta") ?? undefined

  try {
    const sorteos = await listarSorteos({ desde, hasta, limite: limit, offset, soloValidados: true })
    return NextResponse.json({
      ok: true,
      sorteos,
      cantidad: sorteos.length,
      limit,
      offset,
      siguienteOffset: sorteos.length === limit ? offset + limit : null,
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
