/**
 * Validador PURO de sorteos de Poceada Federal (reglas de auditoría del
 * módulo). No escribe nada: devuelve estado, detalle e incidentes para que
 * la capa de persistencia los registre.
 *
 * Verificaciones por sorteo:
 *  1. la fuente pertenece al portal oficial verificado (allowlist de hosts)
 *  2. fecha y concurso en formato válido (y fecha real)
 *  3. el extracto contiene exactamente 20 números
 *  4. cada número está entre 00 y 99
 *  5. no hay números repetidos
 *  6. los campos obligatorios están presentes
 *  7. no contradice a otro registro oficial del mismo concurso
 *  8. con dos fuentes oficiales: comparar y marcar corroborado / conflict
 *
 * La ausencia de datos de premios NUNCA invalida un sorteo.
 */

import { createHash } from "crypto"
import type { EstadoSorteo, SorteoPoceadaFederal } from "./tipos"
import { mismosNumeros } from "./parser"

/** Hosts oficiales verificados (Lotería de Santa Fe e IAFAS). */
export const HOSTS_OFICIALES = [
  "apps.loteriasantafe.gov.ar",
  "www.loteriasantafe.gov.ar",
  "loteriasantafe.gov.ar",
  "jasper2.loteriasantafe.gov.ar",
  "servicios.iafas.gov.ar",
] as const

/** Identificadores de fuente que asigna el módulo (rastreables). */
export const FUENTES = {
  sfHtml: "loteriasantafe-extractos-html",
  iafasListado: "iafas-servicioextracto-listado",
  iafasPdf: "iafas-serviciopdf-pdfpoceada",
  iafasInstantaneo: "iafas-servicioextracto-ultimo",
} as const

export interface IncidenteValidacion {
  concurso?: number
  tipo: string
  detalle: Record<string, unknown>
}

export interface CandidatoSorteo {
  concurso?: number
  fecha?: string
  hora?: string
  numeros?: number[]
  fuente: string
  url?: string
}

export interface ResultadoValidacion {
  estado: EstadoSorteo
  detalle: string
  corroborado: boolean
  contenidoHash: string
  incidentes: IncidenteValidacion[]
}

export function esFuenteOficial(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return (HOSTS_OFICIALES as readonly string[]).some((h) => host === h || host.endsWith("." + h))
  } catch {
    return false
  }
}

export function hashContenido(concurso: number, fecha: string, numeros: number[]): string {
  return createHash("sha256")
    .update(`${concurso}|${fecha}|${[...numeros].sort((a, b) => a - b).join(",")}`)
    .digest("hex")
}

function fechaReal(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false
  const d = new Date(`${fecha}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha
}

function fallo(
  tipo: string,
  detalle: string,
  extra: Partial<ResultadoValidacion> = {}
): ResultadoValidacion {
  return {
    estado: "failed",
    detalle,
    corroborado: false,
    contenidoHash: "",
    incidentes: [{ tipo, detalle: { mensaje: detalle } }],
    ...extra,
  }
}

/**
 * Valida un candidato contra las reglas del módulo.
 * `existentes` = sorteos ya registrados (para detectar contradicciones).
 * `segundaFuente` = números de una segunda fuente oficial independiente.
 */
export function validarSorteo(
  cand: CandidatoSorteo,
  opts: { existentes?: Map<number, SorteoPoceadaFederal>; segundaFuente?: number[] } = {}
): ResultadoValidacion {
  const incidentes: IncidenteValidacion[] = []

  // 1. fuente oficial verificada
  if (cand.url && !esFuenteOficial(cand.url)) {
    return fallo("fuente_no_oficial", `URL de fuente no oficial: ${cand.url}`)
  }
  if (!cand.fuente) return fallo("sin_fuente", "El sorteo no indica fuente")

  // 6. obligatorios + 2. formato de fecha/concurso
  if (cand.concurso === undefined || !Number.isInteger(cand.concurso) || cand.concurso <= 0) {
    return fallo("concurso_invalido", `Concurso inválido: ${cand.concurso}`)
  }
  if (!cand.fecha) return fallo("sin_fecha", "Falta la fecha del sorteo")
  if (!fechaReal(cand.fecha)) {
    return fallo("fecha_invalida", `Fecha inválida: ${cand.fecha}`)
  }
  if (!cand.numeros) return fallo("sin_numeros", "Faltan los 20 números del extracto")

  // 3/4/5. extracto
  const nums = cand.numeros
  if (nums.length !== 20) {
    return fallo("cantidad_numeros", `Extracto con ${nums.length} números (se esperaban 20)`)
  }
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) {
    return fallo("rango_invalido", "Hay números fuera del rango 00-99")
  }
  if (new Set(nums).size !== 20) {
    const reps = nums.filter((n, i) => nums.indexOf(n) !== i)
    return fallo("numeros_repetidos", `Números repetidos: ${[...new Set(reps)].join(", ")}`)
  }

  const contenidoHash = hashContenido(cand.concurso, cand.fecha, nums)

  // 7. contradicción con un registro previo del mismo concurso
  const previo = opts.existentes?.get(cand.concurso)
  if (previo) {
    if (previo.contenidoHash !== contenidoHash) {
      incidentes.push({
        concurso: cand.concurso,
        tipo: "contradiccion",
        detalle: {
          previoHash: previo.contenidoHash,
          nuevoHash: contenidoHash,
          previaFuente: previo.fuente,
          nuevaFuente: cand.fuente,
        },
      })
      return {
        estado: "conflict",
        detalle: `El concurso ${cand.concurso} ya existe con extracto distinto`,
        corroborado: false,
        contenidoHash,
        incidentes,
      }
    }
    // mismo extracto: registro consistente (se omite insertar)
    return {
      estado: previo.estado === "validated" ? "validated" : "pending",
      detalle: "Consistente con el registro existente",
      corroborado: previo.corroborado,
      contenidoHash,
      incidentes,
    }
  }

  // 8. segunda fuente oficial
  let corroborado = false
  if (opts.segundaFuente) {
    if (mismosNumeros(nums, opts.segundaFuente)) {
      corroborado = true
    } else {
      incidentes.push({
        concurso: cand.concurso,
        tipo: "conflicto_entre_fuentes",
        detalle: { fuenteA: cand.fuente, fuenteB: "segunda-fuente-oficial", hashA: contenidoHash },
      })
      return {
        estado: "conflict",
        detalle: "Las dos fuentes oficiales no coinciden",
        corroborado: false,
        contenidoHash,
        incidentes,
      }
    }
  }

  return {
    estado: "validated",
    detalle: "Extracto oficial válido",
    corroborado,
    contenidoHash,
    incidentes,
  }
}
