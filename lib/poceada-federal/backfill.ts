/**
 * Backfill histórico de Poceada Federal — REANUDABLE y por lotes.
 *
 * Fuente: listado oficial IAFAS (Modalidad 30) + PDF oficial del extracto
 * (serviciopdf/Extractos/pdfpoceada). Historial verificado: desde 2021-06-22
 * (consultas anteriores a esa fecha devuelven 0 filas: se documenta, no se
 * inventa). Cada PDF se parsea y valida con las MISMAS reglas que el resto
 * del módulo; un PDF ilegible/incompleto queda como fallido con causa, nunca
 * como sorteo validado.
 *
 * Modo "dry-run": ejecuta todo el proceso (descarga, parseo, validación) sin
 * escribir nada. Modo "importar": inserta sólo concursos inexistentes
 * (ON CONFLICT DO NOTHING → reanudable e idempotente).
 */

import { ErrorParseo } from "./parser"
import { nroLoteriaPreferido } from "./fuente"
import { validarSorteo, FUENTES } from "./validador"
import type { FilaSorteoIAFAS, InformeBackfill } from "./tipos"

export interface RepoBackfill {
  concursos: (desde?: string, hasta?: string) => Promise<Set<number>>
  insertar?: (filas: unknown[]) => Promise<number>
  incidente?: (concurso: number | null, tipo: string, detalle: Record<string, unknown>) => Promise<void>
}

export interface DepsBackfill {
  listar: (desde: string, hasta: string) => Promise<FilaSorteoIAFAS[]>
  pdf: (
    concurso: number,
    fechaISO: string,
    /** NroLoteria preferido según la lotería organizadora del listado. */
    preferencia?: number
  ) => Promise<{ concurso: number; fecha: string; hora: string; numeros: number[] }>
  repo?: RepoBackfill
  onProgreso?: (p: { procesados: number; total: number }) => void
}

export interface OpcionesBackfill {
  desde: string
  hasta: string
  limite?: number
  modo: "dry-run" | "importar"
  ahora?: () => Date
}

const BRECHA_DIAS_ALERTA = 4 // lun-sáb: huecos mayores sugieren sorteo no recuperado

export async function importarHistorico(
  deps: DepsBackfill,
  opts: OpcionesBackfill
): Promise<InformeBackfill> {
  const ahora = opts.ahora ?? (() => new Date())
  const t0 = ahora().getTime()
  const limite = opts.limite ?? 40

  const listado = await deps.listar(opts.desde, opts.hasta)
  const confirmados = listado.filter(
    (f) => String(f.Estado ?? "").toUpperCase() === "CONFIRMADO"
  )
  const noConfirmados = listado.length - confirmados.length

  const existentes = deps.repo ? await deps.repo.concursos(opts.desde, opts.hasta) : new Set<number>()
  const pendientes = confirmados
    .filter((f) => !existentes.has(f.NROSorteo))
    .sort((a, b) => a.Fecha2.localeCompare(b.Fecha2) || a.NROSorteo - b.NROSorteo)

  const lote = pendientes.slice(0, limite)
  let procesados = 0
  let importados = 0
  const fallidosDetalle: { concurso: number; causa: string }[] = []

  for (const fila of lote) {
    procesados++
    deps.onProgreso?.({ procesados, total: lote.length })
    try {
      const ext = await deps.pdf(fila.NROSorteo, fila.Fecha2, nroLoteriaPreferido(fila.Loteria))
      const val = validarSorteo({
        concurso: ext.concurso,
        fecha: ext.fecha,
        hora: ext.hora,
        numeros: ext.numeros,
        fuente: FUENTES.iafasPdf,
      })
      for (const inc of val.incidentes) {
        await deps.repo?.incidente?.(ext.concurso, inc.tipo, inc.detalle)
      }
      if (val.estado !== "validated") {
        fallidosDetalle.push({ concurso: ext.concurso, causa: val.detalle })
        await deps.repo?.incidente?.(ext.concurso, "pdf_invalido", { detalle: val.detalle })
        continue
      }
      if (opts.modo === "importar" && deps.repo?.insertar) {
        const n = await deps.repo.insertar([
          {
            concurso: ext.concurso,
            fecha: ext.fecha,
            hora: ext.hora,
            numeros: ext.numeros,
            fuente: FUENTES.iafasPdf,
            fuentes: [FUENTES.iafasListado, FUENTES.iafasPdf],
            pdf_url: `https://servicios.iafas.gov.ar/serviciopdf/Extractos/pdfpoceada`,
            corroborado: false,
            estado: "validated",
            estado_detalle: val.detalle,
            contenido_hash: val.contenidoHash,
            consultado_en: ahora().toISOString(),
            verificado_en: ahora().toISOString(),
            metadatos: {
              idListado: fila.ID,
              fechaListado: fila.Fecha2,
              ...(fila.Loteria ? { loteria: fila.Loteria.trim() } : {}),
            },
          },
        ])
        if (n > 0) importados++
      } else {
        importados++ // dry-run: se procesaría/válidaría
      }
    } catch (e) {
      const causa =
        e instanceof ErrorParseo
          ? `PDF ilegible/incompleto: ${e.message}`
          : `Error de red/parseo: ${e instanceof Error ? e.message : String(e)}`
      fallidosDetalle.push({ concurso: fila.NROSorteo, causa })
      await deps.repo?.incidente?.(fila.NROSorteo, "backfill_fallido", { causa })
    }
  }

  // Brechas oficiales reales entre sorteos consecutivos del listado.
  const fechas = confirmados.map((f) => f.Fecha2).sort()
  const brechas: InformeBackfill["brechasDias"] = []
  for (let i = 1; i < fechas.length; i++) {
    const a = new Date(`${fechas[i - 1]}T12:00:00Z`).getTime()
    const b = new Date(`${fechas[i]}T12:00:00Z`).getTime()
    const dias = Math.round((b - a) / 864e5)
    if (dias > BRECHA_DIAS_ALERTA) brechas.push({ desde: fechas[i - 1], hasta: fechas[i], dias })
  }

  return {
    ok: fallidosDetalle.length === 0,
    modo: opts.modo,
    ventana: { desde: opts.desde, hasta: opts.hasta },
    encontrados: confirmados.length,
    procesados,
    importados,
    omitidosDuplicados: pendientes.length - lote.length,
    fallidos: fallidosDetalle.length,
    fallidosDetalle,
    primerSorteo: fechas[0],
    ultimoSorteo: fechas[fechas.length - 1],
    brechasDias: brechas,
    duracionMs: ahora().getTime() - t0,
    reanudable: true,
    ...(noConfirmados > 0
      ? { detalle: `${noConfirmados} sorteos del listado no estaban CONFIRMADO` }
      : {}),
  }
}
