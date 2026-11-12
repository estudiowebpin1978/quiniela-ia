import { describe, it, expect, vi } from "vitest"
import {
  parseViewState,
  parseMesSeleccionado,
  parseSorteoOptions,
  parseNumerosCuadrados,
  parseConcursoActual,
  parseTradicionalYJunior,
  fechaDesdeMesYDomingo,
  parsePartialResponse,
  parsePartialViewState,
  buildPostBody,
  fetchExtractoConcursoContexto,
  urlExtractoPdf,
  SOURCE_EXTRACTO,
} from "@/lib/brinco/scraper-extracto"

// Fixture real reducido (HTML del extracto oficial, corte relevante).
const HTML_NOVIEMBRE_2026 = `<html><form id="form" class="form_signin">
<script>PrimeFaces.cw("SelectOneMenu","widget_form_mesSeleccionado",{});</script>
<select id="form:mesSeleccionado_input" name="form:mesSeleccionado_input"><option value="Noviembre 2026" selected="selected">Noviembre 2026</option><option value="Octubre 2026">Octubre 2026</option></select>
<select id="form:sorteoSeleccionado_input" name="form:sorteoSeleccionado_input"><option value="Domingo 8 - 1379">Domingo 8 - 1379</option><option value="Domingo 1 - 1378">Domingo 1 - 1378</option></select>
<a href="https://jasper2.loteriasantafe.gov.ar/visualizaExtracto.php?param_ID_sor=13001379">Ver extracto oficial</a>
<div class="col-xs-2 cuadrado"><b>09</b></div>
<div class="col-xs-2 cuadrado"><b>17</b></div>
<div class="col-xs-2 cuadrado"><b>20</b></div>
<div class="col-xs-2 cuadrado"><b>24</b></div>
<div class="col-xs-2 cuadrado"><b>36</b></div>
<div class="col-xs-2 cuadrado"><b>37</b></div>
<div class="col-xs-2 cuadrado"><b>00</b></div>
<div class="col-xs-2 cuadrado"><b>07</b></div>
<div class="col-xs-2 cuadrado"><b>19</b></div>
<div class="col-xs-2 cuadrado"><b>29</b></div>
<div class="col-xs-2 cuadrado"><b>32</b></div>
<div class="col-xs-2 cuadrado"><b>34</b></div>
<input type="hidden" name="javax.faces.ViewState" id="j_id1:javax.faces.ViewState:0" value="e5KOCHpfSqQPrirz4ZwFpM2w7ZN7keXMhGQtOwqG+UHs=" autocomplete="off" />
</form></html>`

const PARTIAL_1378 = `<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1"><changes><update id="form"><![CDATA[
<form id="form" class="form_signin"><div class="col-xs-2 cuadrado"><b>05</b></div><div class="col-xs-2 cuadrado"><b>10</b></div><div class="col-xs-2 cuadrado"><b>15</b></div><div class="col-xs-2 cuadrado"><b>23</b></div><div class="col-xs-2 cuadrado"><b>27</b></div><div class="col-xs-2 cuadrado"><b>38</b></div><div class="col-xs-2 cuadrado"><b>03</b></div><div class="col-xs-2 cuadrado"><b>12</b></div><div class="col-xs-2 cuadrado"><b>18</b></div><div class="col-xs-2 cuadrado"><b>22</b></div><div class="col-xs-2 cuadrado"><b>25</b></div><div class="col-xs-2 cuadrado"><b>39</b></div></form>
]]></update><update id="j_id1:javax.faces.ViewState:0"><![CDATA[nuevoViewState123==]]></update></changes></partial-response>`

describe("brinco/extracto — parsers puros", () => {
  it("extrae ViewState", () => {
    expect(parseViewState(HTML_NOVIEMBRE_2026)).toBe("e5KOCHpfSqQPrirz4ZwFpM2w7ZN7keXMhGQtOwqG+UHs=")
  })

  it("extrae el mes seleccionado", () => {
    expect(parseMesSeleccionado(HTML_NOVIEMBRE_2026)).toBe("Noviembre 2026")
  })

  it("parsea las opciones de sorteo del mes", () => {
    const opts = parseSorteoOptions(HTML_NOVIEMBRE_2026)
    expect(opts).toEqual([
      { label: "Domingo 8 - 1379", domingo: 8, concurso: 1379 },
      { label: "Domingo 1 - 1378", domingo: 1, concurso: 1378 },
    ])
  })

  it("segmenta tradicional y junior", () => {
    const { tradicional, junior } = parseTradicionalYJunior(HTML_NOVIEMBRE_2026)
    expect(tradicional).toEqual([9, 17, 20, 24, 36, 37])
    expect(junior).toEqual([0, 7, 19, 29, 32, 34])
  })

  it("extrae el concurso visible desde el link PDF oficial", () => {
    expect(parseConcursoActual(HTML_NOVIEMBRE_2026)).toBe(1379)
  })

  it("deriva la fecha ISO desde mes y domingo", () => {
    expect(fechaDesdeMesYDomingo("Noviembre 2026", 8)).toBe("2026-11-08")
    expect(fechaDesdeMesYDomingo("Octubre 2026", 25)).toBe("2026-10-25")
    expect(fechaDesdeMesYDomingo("Septiembre 2026", 6)).toBe("2026-09-06")
    expect(fechaDesdeMesYDomingo("NoExiste 2026", 6)).toBeNull()
    expect(fechaDesdeMesYDomingo("", 6)).toBeNull()
  })

  it("extrae el partial-response XML y el ViewState actualizado", () => {
    const html = parsePartialResponse(PARTIAL_1378)
    expect(html).toContain('class="form_signin"')
    expect(parsePartialViewState(PARTIAL_1378)).toBe("nuevoViewState123==")
  })

  it("buildPostBody codifica los parámetros PrimeFaces", () => {
    const body = buildPostBody({ viewState: "vs=+/", sorteoLabel: "Domingo 8 - 1379" })
    expect(body).toContain("javax.faces.partial.ajax=true")
    expect(body).toContain("javax.faces.source=form%3AsorteoSeleccionado")
    expect(body).toContain("form%3AsorteoSeleccionado_input=Domingo%208%20-%201379")
    expect(body).toContain("javax.faces.ViewState=vs%3D%2B%2F")
    expect(body).toContain("form=form")
  })

  it("urlExtractoPdf usa el patrón oficial 1300+concurso", () => {
    expect(urlExtractoPdf(1378)).toBe("https://jasper2.loteriasantafe.gov.ar/visualizaExtracto.php?param_ID_sor=13001378")
  })
})

describe("brinco/extracto — orquestación por concurso", () => {
  const contextoBase = () => ({
    html: HTML_NOVIEMBRE_2026,
    viewState: "e5KOCHpfSqQPrirz4ZwFpM2w7ZN7keXMhGQtOwqG+UHs=",
    cookie: "JSESSIONID=abc",
    mes: "Noviembre 2026",
    concursoVisible: 1379,
    opciones: [
      { label: "Domingo 8 - 1379", domingo: 8, concurso: 1379 },
      { label: "Domingo 1 - 1378", domingo: 1, concurso: 1378 },
    ],
  })

  it("usa la vista por defecto cuando el concurso coincide", async () => {
    const ctx = contextoBase()
    const fakeParcial = vi.fn()
    const r = await fetchExtractoConcursoContexto(
      ctx as never,
      ctx.opciones[0],
      fakeParcial as never,
    )
    expect(fakeParcial).not.toHaveBeenCalled()
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.sorteo.tradicional).toEqual([9, 17, 20, 24, 36, 37])
    expect(r.sorteo.junior).toEqual([0, 7, 19, 29, 32, 34])
    expect(r.sorteo.fuente).toBe(SOURCE_EXTRACTO)
    expect(r.sorteo.fecha).toBe("2026-11-08")
  })

  it("usa el partial-ajax cuando el concurso es distinto al visible (1378)", async () => {
    const ctx = contextoBase()
    const fakeParcial = vi.fn(async () => ({
      html: parsePartialResponse(PARTIAL_1378) as string,
      viewState: "nuevoViewState123==",
    }))
    const r = await fetchExtractoConcursoContexto(
      ctx as never,
      ctx.opciones[1],
      fakeParcial as never,
    )
    expect(fakeParcial).toHaveBeenCalledTimes(1)
    expect(ctx.viewState).toBe("nuevoViewState123==")
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.sorteo.tradicional).toEqual([5, 10, 15, 23, 27, 38])
    expect(r.sorteo.junior).toEqual([3, 12, 18, 22, 25, 39])
    expect(r.sorteo.fecha).toBe("2026-11-01")
  })

  it("devuelve error si el partial es inválido", async () => {
    const ctx = contextoBase()
    const fakeParcial = vi.fn(async () => null)
    const r = await fetchExtractoConcursoContexto(
      ctx as never,
      ctx.opciones[1],
      fakeParcial as never,
    )
    expect(r.status).toBe("error")
  })
})
