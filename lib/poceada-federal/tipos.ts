/**
 * Tipos del módulo de Poceada Federal (Santa Fe / IAFAS).
 * Juego independiente de Quiniela/Poceada Ciudad/Brinco: 8 números de 00-99,
 * extracto oficial de 20 números. Nunca se mezclan universos.
 */

/** Estados de validación de un sorteo (espejo del CHECK en SQL). */
export type EstadoSorteo = "pending" | "validated" | "conflict" | "failed"

/** Sorteo oficial mínimo para entrenamiento: id, fecha/hora, 20 números, fuente, estado. */
export interface SorteoPoceadaFederal {
  concurso: number
  fecha: string // ISO yyyy-mm-dd
  hora?: string // "15:00" | "21:00" (dato oficial, no inventado)
  numeros: number[] // exactamente 20 enteros 00-99 sin repetidos
  fuente: string
  fuentes: string[]
  urlExtracto?: string
  pdfUrl?: string
  corroborado: boolean
  estado: EstadoSorteo
  estadoDetalle?: string
  contenidoHash: string
  publicadoEn?: string
  consultadoEn: string
  verificadoEn?: string
  metadatos?: Record<string, unknown>
}

/** Resultado del parseo del extracto HTML oficial (Lotería de Santa Fe). */
export interface ExtractoHtmlSF {
  mes: string // "Octubre 2026"
  etiquetaSorteo: string // "Miércoles 14 - 5733"
  concurso: number
  diaMes: number
  diaSemana: string
  fecha: string // ISO yyyy-mm-dd (validada contra el día de la semana)
  numeros: number[]
  premios: PremioFila[]
  pdfUuid?: string
  viewState?: string
  action?: string
}

export interface PremioFila {
  nivel: string // "1° Premio"
  ganadores: string // "VACANTE" | número
  importe: string // texto oficial tal cual
}

/** Resultado del parseo del PDF oficial IAFAS (pdfpoceada). */
export interface ExtractoPdfIAFAS {
  fecha: string // ISO
  concurso: number
  hora: string
  numeros: number[]
}

/** Informe de sincronización (cron). */
export interface InformeSincronizacion {
  ok: boolean
  intentoEn: string
  fuenteUsada: string
  concurso?: number
  importados: number
  corroborados: number
  omitidosDuplicados: number
  conflictos: number
  errores: number
  ultimoValidado?: { concurso: number; fecha: string }
  antiguedadHoras?: number
  detalle?: string
}

/** Informe del backfill/importación histórica (reanudable, por lotes). */
export interface InformeBackfill {
  ok: boolean
  modo: "dry-run" | "importar"
  ventana: { desde: string; hasta: string }
  encontrados: number // sorteos listados en la fuente oficial
  procesados: number // intentados en esta corrida
  importados: number
  omitidosDuplicados: number
  fallidos: number
  fallidosDetalle: { concurso: number; causa: string }[]
  primerSorteo?: string
  ultimoSorteo?: string
  brechasDias: { desde: string; hasta: string; dias: number }[]
  duracionMs: number
  reanudable: boolean
}

/** Fila cruda del listado oficial IAFAS /ServicioExtracto/Sorteos. */
export interface FilaSorteoIAFAS {
  ID: number
  NROSorteo: number
  Fecha2: string // yyyy-mm-dd
  Fecha: string // dd/mm/yyyy
  Juego: string
  idJuego: number
  Hora?: string
  Estado: string
  /** Lotería organizadora del sorteo (crudo del listado, p. ej. " Santa Fe"). */
  Loteria?: string
}

/** Fila cruda de /ServicioExtracto/ultimoExtracto. */
export interface FilaExtractoIAFAS {
  NroLoteria: number
  Valor: number
  Ubicacion: number
  NROSorteo: number
  OrdenSalida: number
  FechaSorteo: string
  HoraSorteo: string
  Modalidad: string
  idModalidad: number
  Cantidad: number
  FechaSorteoSTR?: string
  FKIdSorteo?: number
}
