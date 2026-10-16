/**
 * Sincronización incremental de Poceada Federal (cron + previa a cada análisis).
 *
 * Flujo (todo verificado contra las fuentes reales):
 *  1. IAFAS /ultimoExtracto → sorteos recientes con concurso, fecha, hora y
 *     sus 20 números (fuente estructurada oficial).
 *  2. Lotería de Santa Fe → extracto HTML del último sorteo publicado.
 *  3. Atribución segura del HTML: por rótulo marcado o, si no, por IGUALDAD
 *     DE CONJUNTO contra los sorteos de IAFAS (20 de 100: coincidencia
 *     inequívoca). Si no hay coincidencia → incidente, nunca se guarda adivinado.
 *  4. Validación completa (reglas del validador) e inserción de SÓLO filas
 *     nuevas (duplicados se omiten). Si ambas fuentes coinciden → corroborado.
 *  5. Si IAFAS falla, se usa el HTML de Santa Fe como fuente única con
 *     atribución por rótulo, dejándolo SIN corroborar y diciéndolo en el informe.
 *
 * Nunca inventa el concurso ni los números: o coinciden entre fuentes o se
 * registra incidente.
 */

import {
  obtenerUltimoExtractoSF,
  ultimoExtractoIAFAS,
  type OpcionesRed,
} from "./fuente"
import { mismosNumeros, parsearEtiquetaSorteo, ErrorParseo } from "./parser"
import { FUENTES, hashContenido, validarSorteo } from "./validador"
import type { ExtractoHtmlSF } from "./tipos"
import type { InformeSincronizacion } from "./tipos"

export interface RepoSincronizacion {
  insertar: (filas: unknown[]) => Promise<number>
  mapa: () => Promise<Map<number, { concurso: number; contenidoHash: string; estado: string; corroborado: boolean }>>
  corroborar: (concurso: number, d: { fuentes: string[]; verificado_en: string; url_extracto?: string; metadatos?: Record<string, unknown> }) => Promise<boolean>
  incidente: (concurso: number | null, tipo: string, detalle: Record<string, unknown>) => Promise<void>
  ultimoValidado: () => Promise<{ concurso: number; fecha: string } | null>
  /** Refresca `consultado_en` de concursos consultados de nuevo (best-effort). */
  refrescarConsultas: (concursos: number[], consultadoEn: string) => Promise<number>
}

export interface DepsSincronizacion {
  iafas?: () => Promise<{ concurso: number; fecha: string; hora: string; numeros: number[] }[]>
  sf?: () => Promise<ExtractoHtmlSF>
  repo: RepoSincronizacion
  ahora?: () => Date
  red?: OpcionesRed
}

interface Candidato {
  concurso: number
  fecha: string
  hora?: string
  numeros: number[]
  fuente: string
  fuentes: string[]
  urlExtracto?: string
  corroborado: boolean
  atribucion: string
}

function candidatoDesdeSF(sf: ExtractoHtmlSF): Candidato {
  return {
    concurso: sf.concurso,
    fecha: sf.fecha,
    numeros: sf.numeros,
    fuente: FUENTES.sfHtml,
    fuentes: [FUENTES.sfHtml],
    urlExtracto: "https://apps.loteriasantafe.gov.ar:8443/Extractos/paginas/mostrarPoceadaFederal.xhtml?display=0",
    corroborado: false,
    atribucion: "rotulo-seleccionado",
  }
}

export async function sincronizar(deps: DepsSincronizacion): Promise<InformeSincronizacion> {
  const ahora = deps.ahora ?? (() => new Date())
  const intentoEn = ahora().toISOString()
  const iafas = deps.iafas ?? (() => ultimoExtractoIAFAS(deps.red ?? {}))
  const sf = deps.sf ?? (() => obtenerUltimoExtractoSF(deps.red ?? {}))

  let filasIafas: { concurso: number; fecha: string; hora: string; numeros: number[] }[] = []
  let sfHtml: ExtractoHtmlSF | null = null
  const errores: string[] = []

  try {
    filasIafas = await iafas()
  } catch (e) {
    errores.push(`IAFAS: ${e instanceof Error ? e.message : String(e)}`)
  }
  try {
    sfHtml = await sf()
  } catch (e) {
    errores.push(`Santa Fe: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (filasIafas.length === 0 && !sfHtml) {
    return {
      ok: false,
      intentoEn,
      fuenteUsada: "ninguna",
      importados: 0,
      corroborados: 0,
      omitidosDuplicados: 0,
      conflictos: 0,
      errores: 1,
      detalle: `Sin fuentes disponibles: ${errores.join(" | ")}`,
    }
  }

  const candidatos = new Map<number, Candidato>()
  for (const f of filasIafas) {
    candidatos.set(f.concurso, {
      concurso: f.concurso,
      fecha: f.fecha,
      hora: f.hora || undefined,
      numeros: f.numeros,
      fuente: FUENTES.iafasInstantaneo,
      fuentes: [FUENTES.iafasInstantaneo],
      corroborado: false,
      atribucion: "listado-oficial",
    })
  }

  // Atribución del HTML de Santa Fe (rótulo o igualdad de conjuntos).
  if (sfHtml) {
    let objetivo: Candidato | null = null
    let atribucion = "rotulo-seleccionado"
    const porRotulo = candidatos.get(sfHtml.concurso)
    if (porRotulo && mismosNumeros(porRotulo.numeros, sfHtml.numeros)) {
      objetivo = porRotulo
    } else if (!porRotulo) {
      // sin rótulo fiable en IAFAS: igualdad de conjuntos
      const iguales = [...candidatos.values()].filter((c) => mismosNumeros(c.numeros, sfHtml!.numeros))
      if (iguales.length === 1) {
        objetivo = iguales[0]
        atribucion = "igualdad-conjunto"
      }
    }
    if (objetivo) {
      objetivo.fuentes = [...new Set([...objetivo.fuentes, FUENTES.sfHtml])]
      objetivo.corroborado = true
      objetivo.urlExtracto = candidatoDesdeSF(sfHtml).urlExtracto
      if (!objetivo.hora) objetivo.hora = undefined
    } else {
      const rotulo = parsearEtiquetaSorteo(sfHtml.etiquetaSorteo)
      await deps.repo.incidente(rotulo.concurso, "sf_sin_correspondencia", {
        etiqueta: sfHtml.etiquetaSorteo,
        numeros: sfHtml.numeros,
        conIafas: filasIafas.map((f) => f.concurso),
        detalle: errores.join(" | ") || undefined,
      })
      // Sólo se conserva el HTML como fuente si IAFAS no está disponible
      // (atribución por rótulo con la página por defecto queda registrada).
      if (filasIafas.length === 0) {
        candidatos.set(sfHtml.concurso, candidatoDesdeSF(sfHtml))
      }
    }
  }

  const existentes = await deps.repo.mapa()
  const ahoraIso = intentoEn
  let importados = 0
  let omitidos = 0
  let conflictos = 0
  let corroborados = 0
  const reconsultados: number[] = []
  let insertados: { concurso: number; contenido_hash: string; estado: string }[] = []

  for (const c of [...candidatos.values()]) {
    const val = validarSorteo(
      {
        concurso: c.concurso,
        fecha: c.fecha,
        hora: c.hora,
        numeros: c.numeros,
        fuente: c.fuente,
        url: c.urlExtracto,
      },
      {
        existentes: existentes as never,
        segundaFuente: c.corroborado ? undefined : undefined,
      }
    )
    for (const inc of val.incidentes) {
      await deps.repo.incidente(c.concurso, inc.tipo, inc.detalle)
      if (inc.tipo === "contradiccion" || inc.tipo === "conflicto_entre_fuentes") conflictos++
    }
    if (val.estado === "conflict") continue

    const previo = existentes.get(c.concurso)
    if (previo) {
      omitidos++
      reconsultados.push(c.concurso)
      if (c.corroborado && !previo.corroborado) {
        const ok = await deps.repo.corroborar(c.concurso, {
          fuentes: c.fuentes,
          verificado_en: ahoraIso,
          url_extracto: c.urlExtracto,
          metadatos: { atribucion: c.atribucion },
        })
        if (ok) corroborados++
      }
      continue
    }

    const fila = {
      concurso: c.concurso,
      fecha: c.fecha,
      hora: c.hora,
      numeros: c.numeros,
      fuente: c.fuente,
      fuentes: c.fuentes,
      url_extracto: c.urlExtracto,
      corroborado: c.corroborado,
      estado: val.estado,
      estado_detalle: val.detalle,
      contenido_hash: val.contenidoHash || hashContenido(c.concurso, c.fecha, c.numeros),
      consultado_en: ahoraIso,
      verificado_en: ahoraIso,
      metadatos: { atribucion: c.atribucion },
    }
    const n = await deps.repo.insertar([fila])
    if (n > 0) {
      importados++
      insertados.push({ concurso: c.concurso, contenido_hash: fila.contenido_hash, estado: val.estado })
      if (c.corroborado) corroborados++
    } else {
      omitidos++
    }
  }

  // Los duplicados se consultaron de nuevo en la fuente oficial (y pasaron
  // por el validador): refresca `consultado_en` para que /estado reporte la
  // última consulta REAL aunque no se haya importado ninguna fila nueva.
  // Best-effort: una falla aquí no altera el resultado de la sincronización.
  if (reconsultados.length > 0) {
    try {
      await deps.repo.refrescarConsultas(reconsultados, ahoraIso)
    } catch {
      // observabilidad opcional
    }
  }

  const ultimo = await deps.repo.ultimoValidado()
  return {
    ok: errores.length === 0,
    intentoEn,
    fuenteUsada: filasIafas.length > 0 ? (sfHtml ? "iafas+loteriasantafe" : "iafas") : "loteriasantafe",
    concurso: insertados.length ? insertados[insertados.length - 1].concurso : undefined,
    importados,
    corroborados,
    omitidosDuplicados: omitidos,
    conflictos,
    errores: errores.length,
    ultimoValidado: ultimo ?? undefined,
    antiguedadHoras: ultimo
      ? Math.round((ahora().getTime() - new Date(`${ultimo.fecha}T12:00:00Z`).getTime()) / 36e5)
      : undefined,
    detalle: errores.length ? errores.join(" | ") : undefined,
  }
}

/** Hash de utilidad pública (coherente con el validador). */
export { hashContenido, ErrorParseo }
