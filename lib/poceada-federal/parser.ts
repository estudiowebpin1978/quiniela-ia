/**
 * Parsers PUROS del módulo Poceada Federal.
 *
 * Selectores y formatos VERIFICADOS contra las fuentes oficiales reales
 * (2026-10-14/15), nunca inventados:
 *
 * A) HTML — apps.loteriasantafe.gov.ar:8443/Extractos/paginas/
 *    mostrarPoceadaFederal.xhtml (PrimeFaces):
 *      · números: `<div class="col-xs-2 cuadradoPo"><b>NN</b></div>` × 20
 *      · select#form:mesSeleccionado_input  → <option value="Octubre 2026" selected>
 *      · select#form:sorteoSeleccionado_input → <option value="Miércoles 14 - 5733">
 *        (el sorteo mostrado = opción con selected; en la página por defecto
 *         puede no haber selected → se usa la PRIMERA opción, pero la
 *        atribución segura se resuelve por igualdad de conjuntos contra IAFAS)
 *      · premios: td.tdpremios / td.tdganadores / td.tdimportes
 *      · PDF: visualizaExtracto.php?param_ID_sor=<UUID>
 *      · navegación: input javax.faces.ViewState + action con ;jsessionid
 *      · codificación Latin-1 del servidor (decodificar en fuente.ts)
 *
 * B) PDF — POST https://servicios.iafas.gov.ar/serviciopdf/Extractos/pdfpoceada
 *    {Modalidad:30, NroLoteria:1, Sorteo, FechaSorteo}. Texto real observado:
 *      "…\n01/10/2026 5710 15:00hs\n01 07 10 11 14\n29 33 41 44 48\n…"
 *    Cabecera dd/mm/yyyy CONCURSO HH:MMhs + 4 líneas de 5 números = 20.
 */

import type { ExtractoHtmlSF, ExtractoPdfIAFAS, PremioFila } from "./tipos"

export class ErrorParseo extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = "ErrorParseo"
  }
}

const MESES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

/** "Octubre 2026" → 10 / 2026 (tolerante a mojibake en el nombre). */
export function parsearMes(mes: string): { mes: number; anio: number } {
  const m = mes.match(/^\s*([A-Za-záéíóúñÁÉÍÓÚÑ]+)\s+(\d{4})\s*$/)
  if (!m) throw new ErrorParseo(`Mes inválido: "${mes}"`)
  const num = MESES[m[1].toLowerCase()]
  if (!num) throw new ErrorParseo(`Nombre de mes desconocido: "${mes}"`)
  return { mes: num, anio: Number(m[2]) }
}

/** "Miércoles 14 - 5733" → {diaSemana, diaMes, concurso} (tolerante a Latin-1). */
export function parsearEtiquetaSorteo(etiqueta: string): {
  diaSemana: string
  diaMes: number
  concurso: number
} {
  const m = etiqueta.match(
    /^\s*(Lunes|Martes|Mi.rcoles|Jueves|Viernes|S.bado)\s+(\d{1,2})\s*-\s*(\d+)\s*$/i
  )
  if (!m) throw new ErrorParseo(`Etiqueta de sorteo inválida: "${etiqueta}"`)
  const diaSemana = m[1].toLowerCase().replace(/^(l|j|s)/, (c) => c.toUpperCase())
  const canon: Record<string, string> = {
    Lunes: "lunes", Martes: "martes", Miércoles: "miercoles",
    Jueves: "jueves", Viernes: "viernes", Sábado: "sabado",
  }
  return { diaSemana: canon[m[1]] ?? diaSemana.toLowerCase(), diaMes: Number(m[2]), concurso: Number(m[3]) }
}

const IDX_DIA = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 } as const

/** Construye la fecha ISO validando que el día de la semana del rótulo coincida. */
export function fechaDesdeEtiqueta(
  etiqueta: string,
  mesLabel: string
): { fecha: string; diaSemana: string; diaMes: number; concurso: number } {
  const { diaSemana, diaMes, concurso } = parsearEtiquetaSorteo(etiqueta)
  const { mes, anio } = parsearMes(mesLabel)
  const anioMes = `${anio}-${String(mes).padStart(2, "0")}-${String(diaMes).padStart(2, "0")}`
  const d = new Date(`${anioMes}T12:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.getUTCDate() !== diaMes) {
    throw new ErrorParseo(`Fecha inválida: ${anioMes}`)
  }
  const esperado = IDX_DIA[diaSemana as keyof typeof IDX_DIA]
  if (esperado === undefined) throw new ErrorParseo(`Día de semana desconocido: ${diaSemana}`)
  if (d.getUTCDay() !== esperado) {
    throw new ErrorParseo(
      `Día de semana inconsistente: el rótulo dice ${diaSemana} pero ${anioMes} es ${
        ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getUTCDay()]
      }`
    )
  }
  return { fecha: anioMes, diaSemana, diaMes, concurso }
}

function extraerSelect(html: string, id: string): string {
  const i = html.indexOf(`id="${id}"`)
  if (i < 0) throw new ErrorParseo(`No se encontró el select ${id}`)
  const fin = html.indexOf("</select>", i)
  if (fin < 0) throw new ErrorParseo(`Select ${id} sin cierre`)
  return html.slice(i, fin)
}

function opcionMarcada(seccion: string): string | null {
  const m = seccion.match(/<option value="([^"]+)"[^>]*selected[^>]*>/)
  return m ? m[1] : null
}

function primeraOpcion(seccion: string): string | null {
  const m = seccion.match(/<option value="([^"]+)"/)
  return m ? m[1] : null
}

/** Extrae los 20 números oficiales del HTML (orden de aparición = orden del extracto). */
export function extraerNumerosHtml(html: string): number[] {
  const nums: number[] = []
  const re = /cuadradoPo"><b>(\d{2})<\/b>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) nums.push(Number(m[1]))
  if (nums.length !== 20) {
    throw new ErrorParseo(`El extracto HTML tiene ${nums.length} números (se esperaban 20)`)
  }
  if (new Set(nums).size !== 20) throw new ErrorParseo("El extracto HTML tiene números repetidos")
  return nums
}

export function extraerPremiosHtml(html: string): PremioFila[] {
  const filas: PremioFila[] = []
  const re =
    /class="tdpremios[^"]*"[^>]*>([^<]+)<\/td>\s*<td[^>]*tdganadores[^>]*>([^<]*)<\/td>\s*<td[^>]*tdimportes[^>]*>([^<]*)<\/td>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    filas.push({ nivel: m[1].trim(), ganadores: m[2].trim(), importe: m[3].trim() })
  }
  return filas
}

/**
 * Parsea el extracto HTML oficial de Poceada Federal.
 * Lanza ErrorParseo si el contenido no cumple la estructura verificada.
 */
export function parsearExtractoHtml(html: string): ExtractoHtmlSF {
  if (!html.includes("cuadradoPo")) throw new ErrorParseo("No parece el extracto de Poceada Federal")
  const selMes = extraerSelect(html, "form:mesSeleccionado_input")
  const selSorteo = extraerSelect(html, "form:sorteoSeleccionado_input")
  const mes = opcionMarcada(selMes)
  if (!mes) throw new ErrorParseo("Sin mes seleccionado en el extracto")
  const etiquetaSorteo = opcionMarcada(selSorteo) ?? primeraOpcion(selSorteo)
  if (!etiquetaSorteo) throw new ErrorParseo("Sin sorteos en el dropdown")
  const { fecha, diaSemana, diaMes, concurso } = fechaDesdeEtiqueta(etiquetaSorteo, mes)
  const numeros = extraerNumerosHtml(html)
  const viewState = html.match(/name="javax\.faces\.ViewState"[^>]*value="([^"]+)"/)?.[1]
  const action = html.match(/action="(\/Extractos\/paginas\/mostrarPoceadaFederal\.xhtml[^"]*)"/)?.[1]
  const pdfUuid = html.match(/visualizaExtracto\.php\?param_ID_sor=([A-F0-9-]+)/)?.[1]
  return {
    mes,
    etiquetaSorteo,
    concurso,
    diaMes,
    diaSemana,
    fecha,
    numeros,
    premios: extraerPremiosHtml(html),
    pdfUuid,
    viewState,
    action,
  }
}

/**
 * Parsea el TEXTO del PDF oficial IAFAS (pdfpoceada), ya extraído con
 * pdf-parse. Formato real: cabecera `dd/mm/yyyy CONCURSO HH:MMhs` seguida de
 * 4 líneas con 5 números de dos cifras (= 20 números oficiales).
 */
export function parsearTextoPdfPoceada(texto: string): ExtractoPdfIAFAS {
  const cab = texto.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d+)\s+(\d{2}:\d{2})hs/)
  if (!cab) throw new ErrorParseo("PDF sin cabecera dd/mm/yyyy CONCURSO HH:MMhs")
  const [, dd, mm, yyyy, concurso, hora] = cab
  const despues = texto.slice((cab.index ?? 0) + cab[0].length)
  const numeros: number[] = []
  for (const linea of despues.split(/\r?\n/)) {
    if (/^\s*\d{2}(?:\s+\d{2}){4}\s*$/.test(linea)) {
      for (const t of linea.trim().split(/\s+/)) numeros.push(Number(t))
      if (numeros.length >= 20) break
    }
  }
  if (numeros.length !== 20) {
    throw new ErrorParseo(`PDF con ${numeros.length} números (se esperaban 20)`)
  }
  if (new Set(numeros).size !== 20) throw new ErrorParseo("El PDF tiene números repetidos")
  if (numeros.some((n) => n < 0 || n > 99)) throw new ErrorParseo("El PDF tiene números fuera de 00-99")
  return {
    fecha: `${yyyy}-${mm}-${dd}`,
    concurso: Number(concurso),
    hora,
    numeros,
  }
}

/** Igualdad de conjuntos de20 números (corroboración entre fuentes oficiales). */
export function mismosNumeros(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y).join(",")
  const sb = [...b].sort((x, y) => x - y).join(",")
  return sa === sb
}
