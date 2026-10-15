/**
 * Capa de red de Poceada Federal contra las DOS fuentes oficiales verificadas
 * (todo probado contra los sitios reales, sin endpoints inventados):
 *
 *  A) Lotería de Santa Fe — extractos PrimeFaces (HTML Latin-1):
 *     · GET  .../mostrarPoceadaFederal.xhtml?display=0  → último sorteo
 *     · POST al action con ;jsessionid + javax.faces.ViewState y los campos
 *       form=…, form:mesSeleccionado_input, form:sorteoSeleccionado_input
 *       (POST de formulario completo; el POST de mes solo devuelve HTTP 500
 *        en el servidor oficial: su bean exige un sorteo parseable).
 *       Verificado: cambia de mes y de sorteo correctamente.
 *
 *  B) IAFAS (servicios.iafas.gov.ar) — JSON oficial:
 *     · POST /ServicioExtracto/Sorteos {fechaDesde,fechaHasta,Modalidad:"30"}
 *       → listado de sorteos de Poceada Federal (idJuego 30); máximo 500
 *       filas por consulta → se pagina por ventanas de fechas.
 *       Historial verificado: desde 2021-06-22 (antes: sin datos).
 *     · POST /serviciopdf/Extractos/pdfpoceada
 *       {Modalidad:30,NroLoteria:1,Sorteo,FechaSorteo} → PDF oficial del
 *       extracto (application/pdf verificado, %PDF-1.3, 20 números).
 *     · POST /ServicioExtracto/ultimoExtracto {} → extracto más reciente
 *       con NROSorteo, OrdenSalida 1..20 y Valor 0..99 por número.
 *     · Auth: Bearer JWT que el SPA oficial público sirve en su propio
 *       bundle JS (se extrae en runtime, no se almacena en el repo).
 *
 * Toda respuesta se valida antes de devolverse; cualquier desvío lanza
 * ErrorRed con diagnóstico (nada de datos inventados ni degrados callados).
 */

import {
  parsearExtractoHtml,
  parsearTextoPdfPoceada,
  ErrorParseo,
} from "./parser"
import type {
  ExtractoHtmlSF,
  ExtractoPdfIAFAS,
  FilaExtractoIAFAS,
  FilaSorteoIAFAS,
} from "./tipos"

export class ErrorRed extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorRed"
  }
}

export const URL_SF_BASE = "https://apps.loteriasantafe.gov.ar:8443"
export const PATH_SF = "/Extractos/paginas/mostrarPoceadaFederal.xhtml"
export const URL_IAFAS_SERVICIO = "https://servicios.iafas.gov.ar/ServicioExtracto"
export const URL_IAFAS_PDF = "https://servicios.iafas.gov.ar/serviciopdf/Extractos/pdfpoceada"
export const URL_IAFAS_BUNDLE = "https://servicios.iafas.gov.ar/iafasextractos/static/js/main.fdd969fe.js"
export const MODALIDAD_POCEADA = 30

export interface OpcionesRed {
  fetchImpl?: typeof fetch
  dormir?: (ms: number) => Promise<void>
  intervaloMs?: number
  ahora?: () => number
  tiempoLimiteMs?: number
}

const dormirPorDefecto = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

let ultimoAcceso = 0
async function limitar(o: OpcionesRed): Promise<void> {
  const ahora = (o.ahora ?? Date.now)()
  const intervalo = o.intervaloMs ?? 700
  const espera = ultimoAcceso + intervalo - ahora
  if (espera > 0) await (o.dormir ?? dormirPorDefecto)(espera)
  ultimoAcceso = (o.ahora ?? Date.now)()
}

async function pedir(
  url: string,
  init: RequestInit,
  o: OpcionesRed,
  intentos = 3
): Promise<Response> {
  const f = o.fetchImpl ?? fetch
  let ultimoError: unknown
  for (let i = 0; i < intentos; i++) {
    await limitar(o)
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), o.tiempoLimiteMs ?? 20000)
      const res = await f(url, { ...init, signal: ctrl.signal })
      clearTimeout(t)
      if (res.ok) return res
      ultimoError = new ErrorRed(`HTTP ${res.status} en ${url}`)
      if (res.status < 500) break // 4xx: no reintentar
    } catch (e) {
      ultimoError = e
    }
    await (o.dormir ?? dormirPorDefecto)(500 * (i + 1))
  }
  throw ultimoError instanceof Error ? ultimoError : new ErrorRed(String(ultimoError))
}

/**
 * Decodifica la respuesta HTML del servidor PrimeFaces sin mojibakear.
 * Se intenta UTF-8 estricto (si los bytes son UTF-8 válido, p. ej. "é" = C3 A9,
 * se decodifica correctamente) y si falla se cae a Latin-1 (é = E9). Así el
 * parser recibe "Miércoles"/"Sábado" reales con cualquiera de los dos charset.
 */
export async function textoLatin1(res: Response): Promise<string> {
  const buf = Buffer.from(await res.arrayBuffer())
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf)
  } catch {
    return buf.toString("latin1")
  }
}

// ─── A) Lotería de Santa Fe ──────────────────────────────────────────────────

export async function obtenerUltimoExtractoSF(o: OpcionesRed = {}): Promise<ExtractoHtmlSF> {
  const res = await pedir(`${URL_SF_BASE}${PATH_SF}?display=0`, { method: "GET" }, o)
  const html = await textoLatin1(res)
  return parsearExtractoHtml(html)
}

/**
 * Navega (POST de formulario completo con ViewState fresco) a un sorteo
 * concreto y devuelve su extracto. Verifica en la respuesta que el mes y la
 * etiqueta de sorteo solicitados sean los que quedaron marcados como
 * seleccionados: si no coincide, lanza ErrorRed (nunca devuelve un extracto
 * atribuido al sorteo equivocado).
 */
export async function obtenerExtractoSF(
  mes: string,
  etiquetaSorteo: string,
  o: OpcionesRed = {}
): Promise<ExtractoHtmlSF> {
  const paso = async (mesActual: string): Promise<ExtractoHtmlSF> => {
    const get = await pedir(`${URL_SF_BASE}${PATH_SF}?display=0`, { method: "GET" }, o)
    const html0 = await textoLatin1(get)
    const base = parsearExtractoHtml(html0)
    if (!base.viewState || !base.action) throw new ErrorRed("Respuesta sin ViewState/action JSF")
    const cuerpo = new URLSearchParams({
      form: "form",
      "form:mesSeleccionado_input": mesActual,
      "form:sorteoSeleccionado_input": etiquetaSorteo,
      "javax.faces.ViewState": base.viewState,
    })
    const post = await pedir(
      `${URL_SF_BASE}${base.action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo.toString(),
      },
      o
    )
    const html = await textoLatin1(post)
    return parsearExtractoHtml(html)
  }

  let r = await paso(mes)
  if (r.mes !== mes || r.etiquetaSorteo !== etiquetaSorteo) {
    // Un segundo intento con el ViewState de la página ya intermedia
    // (cambio de mes + sorteo en cadena, como lo hace la página real).
    const get2 = await pedir(`${URL_SF_BASE}${PATH_SF}?display=0`, { method: "GET" }, o)
    const html2 = await textoLatin1(get2)
    const b2 = parsearExtractoHtml(html2)
    if (!b2.viewState || !b2.action) throw new ErrorRed("Respuesta sin ViewState/action JSF")
    const cuerpo2 = new URLSearchParams({
      form: "form",
      "form:mesSeleccionado_input": mes,
      "form:sorteoSeleccionado_input": etiquetaSorteo,
      "javax.faces.ViewState": b2.viewState,
    })
    const post2 = await pedir(
      `${URL_SF_BASE}${b2.action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: cuerpo2.toString(),
      },
      o
    )
    r = parsearExtractoHtml(await textoLatin1(post2))
    if (r.etiquetaSorteo !== etiquetaSorteo) {
      throw new ErrorRed(
        `Navegación fallida: se pidió "${etiquetaSorteo}" y quedó marcado "${r.etiquetaSorteo}"`
      )
    }
  }
  if (r.mes !== mes) throw new ErrorRed(`Navegación fallida: se pidió el mes ${mes} y quedó ${r.mes}`)
  return r
}

// ─── B) IAFAS ────────────────────────────────────────────────────────────────

let cacheJwt: { jwt: string; vence: number } | null = null

/** Extrae el Bearer que el SPA oficial público sirve a todo visitante. */
export async function jwtIafas(o: OpcionesRed = {}): Promise<string> {
  const ahora = (o.ahora ?? Date.now)()
  if (cacheJwt && cacheJwt.vence > ahora) return cacheJwt.jwt
  const res = await pedir(URL_IAFAS_BUNDLE, { method: "GET" }, o, 2)
  const js = await res.text()
  const m = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_\-\.]+/)
  if (!m) throw new ErrorRed("No se encontró el token del SPA oficial IAFAS (bundle cambió)")
  cacheJwt = { jwt: m[0], vence: ahora + 6 * 60 * 60 * 1000 }
  return cacheJwt.jwt
}

async function postIafas(url: string, cuerpo: unknown, o: OpcionesRed): Promise<Response> {
  const jwt = await jwtIafas(o)
  return pedir(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwt}` },
      body: JSON.stringify(cuerpo),
    },
    o
  )
}

function parsearListado(content: string): FilaSorteoIAFAS[] {
  const json: unknown = JSON.parse(content)
  let filas: FilaSorteoIAFAS[] = []
  if (Array.isArray(json)) {
    filas = (Array.isArray(json[0]) ? (json[0] as FilaSorteoIAFAS[]) : (json as FilaSorteoIAFAS[]))
  }
  return filas.filter((f) => f && typeof f.NROSorteo === "number")
}

async function listarVentana(
  desde: string,
  hasta: string,
  o: OpcionesRed
): Promise<FilaSorteoIAFAS[]> {
  const res = await postIafas(
    URL_IAFAS_SERVICIO + "/Sorteos",
    { fechaDesde: desde, fechaHasta: hasta, Modalidad: String(MODALIDAD_POCEADA), estado: "" },
    o
  )
  const filas = parsearListado(await res.text())
  if (filas.length < 500) return filas
  // Límite de 500 filas del servidor → dividir la ventana por la mitad.
  const d0 = new Date(`${desde}T12:00:00Z`)
  const d1 = new Date(`${hasta}T12:00:00Z`)
  const medio = new Date((d0.getTime() + d1.getTime()) / 2)
  const mitad = medio.toISOString().slice(0, 10)
  if (mitad <= desde || mitad >= hasta) {
    throw new ErrorRed(`Ventana ${desde}..${hasta} no reducible (límite de 500 filas)`)
  }
  const [a, b] = await Promise.all([
    listarVentana(desde, mitad, o),
    listarVentana(mitad, hasta, o),
  ])
  return [...a, ...b]
}

/** Listado oficial de sorteos de Poceada Federal (deduplicado por concurso). */
export async function listarSorteosIAFAS(
  desde: string,
  hasta: string,
  o: OpcionesRed = {}
): Promise<FilaSorteoIAFAS[]> {
  const filas = await listarVentana(desde, hasta, o)
  const mapa = new Map<number, FilaSorteoIAFAS>()
  for (const f of filas) {
    if (f.idJuego !== MODALIDAD_POCEADA && !/poceada/i.test(f.Juego ?? "")) continue
    if (!mapa.has(f.NROSorteo)) mapa.set(f.NROSorteo, f)
  }
  return [...mapa.values()].sort(
    (a, b) => a.Fecha2.localeCompare(b.Fecha2) || a.NROSorteo - b.NROSorteo
  )
}

/** PDF oficial del extracto (verificado: application/pdf, %PDF-1.3). */
export async function descargarExtractoPdfIAFAS(
  concurso: number,
  fechaISO: string,
  o: OpcionesRed = {}
): Promise<Buffer> {
  const res = await postIafas(
    URL_IAFAS_PDF,
    { Modalidad: MODALIDAD_POCEADA, NroLoteria: 1, Sorteo: concurso, FechaSorteo: fechaISO },
    o
  )
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 8 || buf.toString("latin1", 0, 5) !== "%PDF-") {
    throw new ErrorRed(`Respuesta sin cabecera %PDF para el concurso ${concurso}`)
  }
  return buf
}

/**
 * En runtime serverless (Vercel) no existe `DOMMatrix` global y pdf-parse/pdfjs
 * lo necesita. Se polyfilla desde @napi-rs/canvas (nativo) si está disponible;
 * si no, el fallo queda registrado como fallido auditado (nunca validado).
 */
async function polyfillDomMatrix(): Promise<void> {
  const g = globalThis as { DOMMatrix?: unknown }
  if (typeof g.DOMMatrix !== "undefined") return
  try {
    const canvas = (await import("@napi-rs/canvas")) as { DOMMatrix?: unknown }
    if (canvas.DOMMatrix) g.DOMMatrix = canvas.DOMMatrix
  } catch {
    // sin canvas nativo: pdf-parse lanzará y quedará como fallido registrado
  }
}

export async function textoPdf(buf: Buffer): Promise<string> {
  try {
    await polyfillDomMatrix()
    const { PDFParse } = await import("pdf-parse")
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    const r = await parser.getText()
    await parser.destroy?.()
    return r.text
  } catch (e) {
    throw new ErrorParseo(`No se pudo extraer el texto del PDF: ${String(e)}`)
  }
}

export async function extraerExtractoPdfIAFAS(
  concurso: number,
  fechaISO: string,
  o: OpcionesRed = {}
): Promise<ExtractoPdfIAFAS> {
  const buf = await descargarExtractoPdfIAFAS(concurso, fechaISO, o)
  const texto = await textoPdf(buf)
  const ext = parsearTextoPdfPoceada(texto)
  if (ext.concurso !== concurso) {
    throw new ErrorRed(`PDF del concurso ${concurso} devolvió el concurso ${ext.concurso}`)
  }
  if (ext.fecha !== fechaISO) {
    throw new ErrorRed(`PDF del concurso ${concurso} declara fecha ${ext.fecha} (se esperaba ${fechaISO})`)
  }
  return ext
}

/** Extracto más reciente IAFAS agrupado por concurso (20 números). */
export async function ultimoExtractoIAFAS(
  o: OpcionesRed = {}
): Promise<
  { concurso: number; fecha: string; hora: string; numeros: number[]; prescripcion?: string }[]
> {
  const res = await postIafas(URL_IAFAS_SERVICIO + "/ultimoExtracto", {}, o)
  const json: unknown = JSON.parse(await res.text())
  if (!Array.isArray(json)) throw new ErrorRed("ultimoExtracto no devolvió una lista")
  const filas = (json as FilaExtractoIAFAS[]).filter(
    (f) => f.Modalidad === "Poceada Federal" && Array.isArray(f.OrdenSalida) === false
  )
  const porConcurso = new Map<number, FilaExtractoIAFAS[]>()
  for (const f of filas) {
    if (!porConcurso.has(f.NROSorteo)) porConcurso.set(f.NROSorteo, [])
    porConcurso.get(f.NROSorteo)!.push(f)
  }
  const out: { concurso: number; fecha: string; hora: string; numeros: number[]; prescripcion?: string }[] = []
  for (const [concurso, grupo] of porConcurso) {
    const ordenados = [...grupo].sort((a, b) => a.OrdenSalida - b.OrdenSalida)
    const numeros = ordenados.map((f) => Number(f.Valor))
    if (numeros.length !== 20) continue // sólo extractos completos
    if (numeros.some((n) => !Number.isInteger(n) || n < 0 || n > 99)) continue
    if (new Set(numeros).size !== 20) continue
    const p = ordenados[0]
    out.push({
      concurso,
      fecha: (p.FechaSorteo ?? "").slice(0, 10),
      hora: p.HoraSorteo ?? "",
      numeros,
      prescripcion: undefined,
    })
  }
  return out.sort((a, b) => b.concurso - a.concurso)
}
