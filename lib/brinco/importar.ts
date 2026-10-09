/**
 * Importador histórico del Brinco — reanudable, idempotente y auditable.
 *
 * Principios:
 *  - Idempotente: importar dos veces la misma fecha NO duplica concursos (upsert
 *    por concurso). Si el concurso ya existe con la MISMA combinación se omite;
 *    si difiere, se marca "conflicto" y NO se sobrescribe (auditar, no destruir).
 *  - Reanudable: se pueden saltar fechas ya importadas para no re-descargar.
 *  - Auditable: guarda fuente, url, estado de verificación y fechas.
 *  - Honestidad: clasifica cada sorteo en un estado explícito; los pendientes o
 *    rechazados nunca contaminan el entrenamiento.
 *
 * El almacenamiento se inyecta vía `BrincoStore` para poder probarse sin DB.
 */

import logger from "@/lib/logger"
import {
  fetchBrincoCas,
  type BrincoSorteoScrapeado,
  type ResultadoScraper,
} from "@/lib/brinco/scraper-cas"
import { periodoJunior, type EstadoVerificacion } from "@/lib/brinco/reglas"

/** Fila de `brinco_draws` (formato normalizado para persistir). */
export interface BrincoDrawRow {
  concurso: number
  fecha: string
  tradicional: number[]
  junior: number[] | null
  reglas_junior: string
  estado_verificacion: EstadoVerificacion
  fuente: string
  url: string
  metadatos: Record<string, unknown>
  importado_en: string
  ultimo_intento: string
  verificado_en: string | null
}

/** Abstracción de persistencia (Supabase en prod, memoria en tests). */
export interface BrincoStore {
  getByConcurso(concurso: number): Promise<BrincoDrawRow | null>
  getByFecha(fecha: string): Promise<BrincoDrawRow | null>
  insertOrIgnore(row: BrincoDrawRow): Promise<"insertado" | "omitido">
}

export type EstadoImportacion =
  | "importado"
  | "duplicado_omitido"
  | "conflicto"
  | "rechazado"
  | "sin_resultado"
  | "error"

export interface DetalleImportacion {
  fecha: string
  concurso?: number
  status: EstadoImportacion
  motivo?: string
}

export interface InformeImportacion {
  total_fechas: number
  importados: number
  omitidos_duplicados: number
  conflictos: number
  rechazados: number
  sin_resultado: number
  errores: number
  detalles: DetalleImportacion[]
}

function informeVacio(total: number): InformeImportacion {
  return {
    total_fechas: total,
    importados: 0,
    omitidos_duplicados: 0,
    conflictos: 0,
    rechazados: 0,
    sin_resultado: 0,
    errores: 0,
    detalles: [],
  }
}

function mismoSorteo(a: BrincoDrawRow, b: { tradicional: number[]; junior: number[] | null }): boolean {
  const iguales = (x: number[] | null, y: number[] | null): boolean => {
    if (!x && !y) return true
    if (!x || !y) return false
    const sx = [...x].sort((p, q) => p - q).join(",")
    const sy = [...y].sort((p, q) => p - q).join(",")
    return sx === sy
  }
  return iguales(a.tradicional, b.tradicional) && iguales(a.junior, b.junior)
}

/** Convierte un sorteo scrapeado en fila normalizada (con período de reglas). */
export function aFila(s: BrincoSorteoScrapeado, estado: EstadoVerificacion = "pending_verification"): BrincoDrawRow {
  const ahora = new Date().toISOString()
  return {
    concurso: s.concurso,
    fecha: s.fecha,
    tradicional: [...s.tradicional].sort((a, b) => a - b),
    junior: s.junior ? [...s.junior].sort((a, b) => a - b) : null,
    reglas_junior: periodoJunior(s.fecha, s.concurso),
    estado_verificacion: estado,
    fuente: s.fuente,
    url: s.url,
    metadatos: { extraido_en: s.extraido_en },
    importado_en: ahora,
    ultimo_intento: ahora,
    // CAS es la fuente oficial publicada → verified_official al importar.
    verificado_en: ahora,
  }
}

/**
 * Importa sorteos ya scrapeados en la tienda, de forma idempotente.
 * NO hace red: recibe resultados y los persiste clasificando cada uno.
 */
export async function importarSorteos(
  sorteos: BrincoSorteoScrapeado[],
  store: BrincoStore,
): Promise<InformeImportacion> {
  const informe = informeVacio(sorteos.length)
  for (const s of sorteos) {
    const existente = await store.getByConcurso(s.concurso)
    if (existente) {
      if (mismoSorteo(existente, s)) {
        informe.omitidos_duplicados++
        informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "duplicado_omitido" })
      } else {
        // Discrepancia real: NO elegimos arbitrariamente. Se marca para auditoría.
        informe.conflictos++
        informe.detalles.push({
          fecha: s.fecha,
          concurso: s.concurso,
          status: "conflicto",
          motivo: "El concurso existe con una combinación distinta; no se sobrescribe",
        })
        logger.warn("[brinco-import] conflicto de concurso", {
          concurso: s.concurso,
          existente: existente.tradicional,
          nuevo: s.tradicional,
        })
      }
      continue
    }

    // La fecha ya tiene un concurso distinto → inconsistencia de fuente.
    const porFecha = await store.getByFecha(s.fecha)
    if (porFecha && porFecha.concurso !== s.concurso) {
      informe.conflictos++
      informe.detalles.push({
        fecha: s.fecha,
        concurso: s.concurso,
        status: "conflicto",
        motivo: `La fecha ya tiene el concurso ${porFecha.concurso}`,
      })
      continue
    }

    const fila = aFila(s, "verified_official")
    const res = await store.insertOrIgnore(fila)
    if (res === "insertado") {
      informe.importados++
      informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "importado" })
    } else {
      informe.omitidos_duplicados++
      informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "duplicado_omitido" })
    }
  }
  return informe
}

/** Limita la concurrencia de operaciones async (evita saturar la fuente). */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

export interface OpcionesBackfill {
  /** Fechas ya presentes (para saltarlas y reanudar). Si se omite, se consulta la store. */
  omitirExistentes?: boolean
  concurrency?: number
  pausaMs?: number
  /** Si es false (default), solo scrapea y clasifica sin escribir (dry-run). */
  apply?: boolean
}

/**
 * Backfill de un rango de fechas (domingos). Reanudable: salta fechas ya
 * importadas. Dry-run por defecto; `apply: true` para escribir.
 */
export async function backfillFechas(
  fechas: string[],
  store: BrincoStore,
  opciones: OpcionesBackfill = {},
): Promise<InformeImportacion> {
  const { concurrency = 2, pausaMs = 250, apply = false, omitirExistentes = true } = opciones

  // 1. Filtrar fechas ya importadas (reanudación / no re-descarga completa).
  let pendientes = fechas
  if (omitirExistentes) {
    const existentes = await mapLimit(fechas, concurrency, (f) => store.getByFecha(f))
    pendientes = fechas.filter((_, i) => existentes[i] === null)
  }

  const informe = informeVacio(fechas.length)
  informe.detalles = []
  // Contamos las omitidas por reanudación en el total.
  const omitidasPrevias = fechas.length - pendientes.length
  for (let i = 0; i < omitidasPrevias; i++) {
    informe.omitidos_duplicados++
    informe.detalles.push({ fecha: "", status: "duplicado_omitido", motivo: "reanudación: fecha ya importada" })
  }

  // 2. Scrapear con concurrencia limitada y pausa entre tandas.
  const scrapeados = await mapLimit(pendientes, concurrency, async (f, idx) => {
    if (idx > 0 && pausaMs > 0) await new Promise((r) => setTimeout(r, pausaMs))
    const r: ResultadoScraper = await fetchBrincoCas(f)
    return r
  })

  // 3. Clasificar resultados.
  const válidos: BrincoSorteoScrapeado[] = []
  for (const r of scrapeados) {
    if (r.status === "ok") {
      válidos.push(r.sorteo)
    } else if (r.status === "sin_resultado") {
      informe.sin_resultado++
      informe.detalles.push({ fecha: r.fecha, status: "sin_resultado" })
    } else {
      informe.errores++
      informe.detalles.push({ fecha: r.fecha, status: "error", motivo: r.detalle })
    }
  }

  // 4. Persistir (idempotente) solo si apply.
  if (apply) {
    const res = await importarSorteos(válidos, store)
    informe.importados = res.importados
    informe.omitidos_duplicados += res.omitidos_duplicados
    informe.conflictos = res.conflictos
    informe.rechazados = res.rechazados
    informe.detalles.push(...res.detalles)
  } else {
    // Dry-run: simular clasificación sin escribir.
    for (const s of válidos) {
      const existente = await store.getByConcurso(s.concurso)
      if (existente && mismoSorteo(existente, s)) {
        informe.omitidos_duplicados++
        informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "duplicado_omitido" })
      } else if (existente) {
        informe.conflictos++
        informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "conflicto" })
      } else {
        informe.importados++ // se importarían
        informe.detalles.push({ fecha: s.fecha, concurso: s.concurso, status: "importado" })
      }
    }
  }

  return informe
}

/** Genera los domingos (fechas ISO) de un rango [desde, hasta] inclusive. */
export function domingosEntre(desdeISO: string, hastaISO: string): string[] {
  const out: string[] = []
  const d = new Date(`${desdeISO}T12:00:00Z`)
  const fin = new Date(`${hastaISO}T12:00:00Z`)
  while (d.getTime() <= fin.getTime()) {
    if (d.getUTCDay() === 0) out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return out
}

/** Últimos N domingos terminados (para update incremental bajo demanda / cron). */
export function ultimosDomingos(n: number, desdeISO?: string): string[] {
  const hoy = desdeISO ? new Date(`${desdeISO}T12:00:00Z`) : new Date()
  const out: string[] = []
  const d = new Date(hoy)
  // Retroceder hasta el domingo más reciente (o el mismo si cae domingo).
  while (d.getUTCDay() !== 0) d.setUTCDate(d.getUTCDate() - 1)
  while (out.length < n) {
    out.push(d.toISOString().slice(0, 10))
    d.setUTCDate(d.getUTCDate() - 7)
  }
  return out
}
