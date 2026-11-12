/**
 * Fuente alternativa OFICIAL — Extracto Brinco (Lotería de Santa Fe).
 *
 * cas.gob.ar (Caja de Acción Social) retrasa/no siempre publica los resultados
 * de Brinco. La Lotería de Santa Fe —autoridad publicante del juego— sí los
 * muestra en su app de extractos:
 *
 *   http://apps.loteriasantafe.gov.ar:8078/Extractos/paginas/mostrarBrinco.xhtml
 *
 * Estructura: formulario JSF (PrimeFaces 5.2), selects de mes ("Noviembre 2026")
 * y sorteo ("Domingo 8 - 1379"), los 6 números Tradicionales y 6 Junior en
 * `<div class="col-xs-2 cuadrado"><b>NN</b></div>`, y un enlace al PDF oficial
 *   https://jasper2.loteriasantafe.gov.ar/visualizaExtracto.php?param_ID_sor=1300{concurso}
 * (válido apróx. concurso >= 1351; devuelve "No se encontró el sorteo" fuera de ventana).
 *
 * Flujo de sincronización para el cron / bajo demanda:
 *   GET mostrarBrinco.xhtml → mes y sorteo seleccionados por defecto (el más
 *   reciente publicado) + sesión JSESSIONID.
 *   POST (partial-ajax) cambiando `form:sorteoSeleccionado_input` → el parcial
 *   devuelve el formulario completo con los números de ese concurso.
 *
 * Garantías: nunca se inventan datos — si el extracto no responde o el concurso
 * no existe, se devuelve resultado `error`/`sin_resultado` y se conserva lo que
 * ya hay en la base. Fuente verificable: enlace al PDF oficial por sorteo.
 * Nota: el servidor solo sirve HTTP (no TLS); es el sitio oficial de la autoridad.
 */

import logger from "@/lib/logger"
import {
  importarSorteos,
  type BrincoStore,
} from "@/lib/brinco/importar"
import type { BrincoSorteoScrapeado } from "@/lib/brinco/scraper-cas"

const URL_XHTML = "http://apps.loteriasantafe.gov.ar:8078/Extractos/paginas/mostrarBrinco.xhtml"
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const FETCH_TIMEOUT = 15000

export const SOURCE_EXTRACTO = "extracto-oficial-loteria-santa-fe"

export interface ExtractoBrinco {
  concurso: number
  fecha: string // ISO YYYY-MM-DD (derivado de mes + domingo)
  tradicional: number[]
  junior: number[] | null
  fuente: typeof SOURCE_EXTRACTO
  url: string // PDF oficial del sorteo
  extraido_en: string
}

export type ResultadoExtracto =
  | { status: "ok"; sorteo: ExtractoBrinco }
  | { status: "sin_resultado"; motivo: string }
  | { status: "error"; detalle: string }

/** URL al PDF oficial del extracto para un concurso. */
export function urlExtractoPdf(concurso: number): string {
  return `https://jasper2.loteriasantafe.gov.ar/visualizaExtracto.php?param_ID_sor=1300${concurso}`
}

// ─── Parsers PUROS (sin red) ────────────────────────────────────────────────

const MESES_ES: Record<string, number> = {
  Enero: 1,
  Febrero: 2,
  Marzo: 3,
  Abril: 4,
  Mayo: 5,
  Junio: 6,
  Julio: 7,
  Agosto: 8,
  Septiembre: 9,
  Octubre: 10,
  Noviembre: 11,
  Diciembre: 12,
}

/** ViewState del formulario JSF. */
export function parseViewState(html: string): string | null {
  const m = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)
  return m ? m[1] : null
}

/** Mes seleccionado (ej. `"Noviembre 2026"`). Tolera ausencia de etiqueta visible. */
export function parseMesSeleccionado(html: string): string | null {
  const m = html.match(/<option value="([A-Za-zÁÉÍÓÚáéíóúñÑ ]+ \d{4})" selected="selected">/)
  return m ? m[1].trim() : null
}

export interface ExtractoSorteoOpcion {
  label: string // "Domingo 8 - 1379"
  domingo: number
  concurso: number
}

/** Opciones del selector de sorteos del mes visible. */
export function parseSorteoOptions(html: string): ExtractoSorteoOpcion[] {
  const out: ExtractoSorteoOpcion[] = []
  const re = /<option value="Domingo\s+(\d{1,2})\s*-\s*(\d+)"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const domingo = Number.parseInt(m[1], 10)
    const concurso = Number.parseInt(m[2], 10)
    if (Number.isFinite(domingo) && Number.isFinite(concurso)) {
      out.push({ label: `Domingo ${domingo} - ${concurso}`, domingo, concurso })
    }
  }
  return out
}

/** Extrae los 12 números (o los que haya) de los cuadrados bold. */
export function parseNumerosCuadrados(html: string): number[] {
  const nums: number[] = []
  const re = /<div class="col-xs-2 cuadrado"><b>(\d{2})<\/b><\/div>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) nums.push(Number.parseInt(m[1], 10))
  return nums.slice(0, 12)
}

/** Concurso del extracto mostrado por defecto, via el enlace al PDF oficial. */
export function parseConcursoActual(html: string): number | null {
  const m = html.match(/param_ID_sor=1300(\d{3,4})/)
  return m ? Number.parseInt(m[1], 10) : null
}

/** Segmenta números en Tradicional (primeros 6) y Junior (siguientes 6). */
export function parseTradicionalYJunior(html: string): {
  tradicional: number[]
  junior: number[] | null
} {
  const nums = parseNumerosCuadrados(html)
  const tradicional = nums.slice(0, 6)
  const junior = nums.length >= 12 ? nums.slice(6, 12) : null
  return { tradicional, junior: junior && junior.length === 6 ? junior : null }
}

/** Fecha ISO a partir de etiqueta de mes ("Noviembre 2026") y domingo (8). */
export function fechaDesdeMesYDomingo(mesLabel: string, domingo: number): string | null {
  const m = mesLabel.trim().match(/^([A-Za-zÁÉÍÓÚáéíóúñÑ]+)\s+(\d{4})$/)
  if (!m) return null
  const mes = MESES_ES[m[1]]
  if (!mes) return null
  const mm = String(mes).padStart(2, "0")
  const dd = String(domingo).padStart(2, "0")
  return `${m[2]}-${mm}-${dd}`
}

/** URL del xhtml (para trazabilidad en `url` de la fila). */
export function urlExtractoXhtml(): string {
  return URL_XHTML
}

// ─── Red (JSF partial-ajax) ─────────────────────────────────────────────────

/** Parsea el partial-response XML y devuelve el HTML del formulario incluido en CDATA. */
export function parsePartialResponse(xml: string): string | null {
  const m = xml.match(/<update\s+id="form"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)
  if (m) return m[1]
  // Algunos servidores podrían devolver el form directo; conservar compatibilidad.
  if (xml.includes('class="form_signin"')) return xml
  return null
}

async function fetchConSesion(
  body: string | null,
  cookie: string | null,
): Promise<{ html: string; cookie: string | null }> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  }
  if (cookie) headers.Cookie = cookie
  if (body) {
    headers["Content-Type"] = "application/x-www-form-urlencoded"
  }
  const resp = await fetch(URL_XHTML, {
    method: body ? "POST" : "GET",
    headers,
    body: body ?? undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  })
  const setCookie = resp.headers.get("set-cookie")
  let nextCookie = cookie
  if (setCookie) {
    const m = setCookie.match(/JSESSIONID=[^;]+/)
    if (m) nextCookie = m[0]
  }
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`)
  }
  return { html: await resp.text(), cookie: nextCookie }
}

/**
 * GET al extracto oficial: devuelve lo que la Lotería de Santa Fe muestra como
 * más reciente (mes actual) + el contexto JSF necesario para los POST.
 */
export async function fetchExtractoInicial(): Promise<{
  html: string
  viewState: string
  cookie: string | null
  mes: string | null
  concursoVisible: number | null
  opciones: ExtractoSorteoOpcion[]
}> {
  const { html, cookie } = await fetchConSesion(null, null)
  const viewState = parseViewState(html)
  if (!viewState) throw new Error("ViewState no encontrado (¿cambió la app?)")
  return {
    html,
    viewState,
    cookie,
    mes: parseMesSeleccionado(html),
    concursoVisible: parseConcursoActual(html),
    opciones: parseSorteoOptions(html),
  }
}

/**
 * Construye el cuerpo POST partial-ajax para cambiar el sorteo seleccionado.
 * Exportado para tests.
 */
export function buildPostBody(input: { viewState: string; sorteoLabel: string }): string {
  const params: Record<string, string> = {
    "javax.faces.partial.ajax": "true",
    "javax.faces.source": "form:sorteoSeleccionado",
    "javax.faces.partial.execute": "form:sorteoSeleccionado",
    "javax.faces.partial.render": "form",
    "form:sorteoSeleccionado_input": input.sorteoLabel,
    "javax.faces.ViewState": input.viewState,
    form: "form",
  }
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&")
}

/** Parsea el AppViewState actualizado dentro del partial-response, si viene. */
export function parsePartialViewState(xml: string): string | null {
  const m = xml.match(/<update\s+id="[^"]*ViewState[^"]*"><!\[CDATA\[([^\]]+)\]\]><\/update>/i)
  return m ? m[1] : null
}

/** POST para cambiar de sorteo; devuelve el HTML parcial del formulario y el ViewState actualizado. */
export async function fetchSorteoParcial(
  contexto: { viewState: string; cookie: string | null },
  sorteoLabel: string,
): Promise<{ html: string; viewState: string | null } | null> {
  const body = buildPostBody({ viewState: contexto.viewState, sorteoLabel })
  const { html } = await fetchConSesion(body, contexto.cookie)
  const partial = parsePartialResponse(html)
  if (!partial) return null
  return { html: partial, viewState: parsePartialViewState(html) }
}

/**
 * Descarga el extracto oficial de UN concurso del mes visible del xhtml.
 * `fetchImpl` inyectable para tests (no se usa red en tests).
 */
export async function fetchExtractoConcursoContexto(
  contexto: Awaited<ReturnType<typeof fetchExtractoInicial>>,
  opcion: ExtractoSorteoOpcion,
  fetchParcial: typeof fetchSorteoParcial = fetchSorteoParcial,
): Promise<ResultadoExtracto> {
  // Si el concurso pedido es el que la vista muestra por defecto, usar el HTML directo.
  let html = contexto.html
  const concursoVisible = parseConcursoActual(html)
  if (concursoVisible !== opcion.concurso) {
    const parcial = await fetchParcial(
      { viewState: contexto.viewState, cookie: contexto.cookie },
      opcion.label,
    )
    if (!parcial) return { status: "error", detalle: `Parcial inválido para ${opcion.label}` }
    if (parcial.viewState) contexto.viewState = parcial.viewState
    html = parcial.html
  }
  const nums = parseTradicionalYJunior(html)
  if (nums.tradicional.length !== 6) {
    return { status: "error", detalle: `Tradicional inválido en ${opcion.label}` }
  }
  const fecha = fechaDesdeMesYDomingo(contexto.mes ?? "", opcion.domingo)
  if (!fecha) return { status: "error", detalle: `Fecha inválida desde mes "${contexto.mes}"` }
  const ahora = new Date().toISOString()
  return {
    status: "ok",
    sorteo: {
      concurso: opcion.concurso,
      fecha,
      tradicional: nums.tradicional,
      junior: nums.junior,
      fuente: SOURCE_EXTRACTO,
      url: urlExtractoPdf(opcion.concurso),
      extraido_en: ahora,
    },
  }
}

// ─── Orquestación: importar los sorteos del mes visible que falten en la BD ──

export interface ResultadoFaltantesExtracto {
  intentos: number
  importados: number
  yaPresentes: number
  duplicados: number
  conflictos: number
  errores: number
  fuenteDisponible: boolean
  detalle: string[]
}

/**
 * Completa los sorteos del mes visible del extracto oficial que NO estén en la
 * store (idempotente: por concurso). No cambia lo existente — si el concurso ya
 * está, se cuenta como presente y no se toca.
 *
 * Se usa como fallback/ complemento cuando cas.gob.ar no publica (acontecido
 * con los concursos 1378 y 1379 del 1 y 8 de noviembre de 2026).
 */
export async function importarFaltantesDesdeExtractoOficial(
  store: BrincoStore,
  deps: {
    fetchInicial?: typeof fetchExtractoInicial
    fetchParcial?: typeof fetchSorteoParcial
  } = {},
): Promise<ResultadoFaltantesExtracto> {
  const out: ResultadoFaltantesExtracto = {
    intentos: 0,
    importados: 0,
    yaPresentes: 0,
    duplicados: 0,
    conflictos: 0,
    errores: 0,
    fuenteDisponible: false,
    detalle: [],
  }
  const fetchIni = deps.fetchInicial ?? fetchExtractoInicial
  const fetchParc = deps.fetchParcial ?? fetchSorteoParcial

  let ctx
  try {
    ctx = await fetchIni()
  } catch (e) {
    out.errores++
    out.detalle.push(`extracto inalcanzable: ${String(e)}`)
    logger.warn("[brinco-extracto] fuente inalcanzable", { error: String(e) })
    return out
  }
  out.fuenteDisponible = true

  // Deduplicar opciones por concurso manteniendo orden por concurso.
  const vistos = new Set<number>()
  const opciones = [...ctx.opciones]
    .sort((a, b) => a.concurso - b.concurso)
    .filter((o) => (vistos.has(o.concurso) ? false : (vistos.add(o.concurso), true)))

  const faltantes: ExtractoBrinco[] = []
  for (const op of opciones) {
    const existe = await store.getByConcurso(op.concurso)
    if (existe) {
      out.yaPresentes++
      continue
    }
    out.intentos++
    const r = await fetchExtractoConcursoContexto(ctx, op, fetchParc)
    if (r.status === "ok") {
      faltantes.push(r.sorteo)
    } else {
      out.errores++
      out.detalle.push(`concurso ${op.concurso}: ${r.status === "error" ? r.detalle : r.motivo}`)
    }
  }

  if (faltantes.length > 0) {
    const informe = await importarSorteos(faltantes as unknown as BrincoSorteoScrapeado[], store)
    out.importados = informe.importados
    out.duplicados = informe.omitidos_duplicados
    out.conflictos = informe.conflictos
    out.detalle.push(
      ...informe.detalles.map((d) => `concurso ${d.concurso ?? d.fecha}: ${d.status}`),
    )
  }
  return out
}
