import { describe, it, expect } from "vitest"
import { parseBrincoCas } from "@/lib/brinco/scraper-cas"

// Fixture que replica la estructura de CAS (Tradicional y Junior en tarjetas).
function htmlConResultado(opts: {
  concurso: number
  tradicional: number[]
  junior?: number[] | null
  fechaTexto?: string
}): string {
  const bola = (n: number) => `<div class="quini6-ball">${String(n).padStart(2, "0")}</div>`
  const trad = opts.tradicional.map(bola).join("")
  const juniorCard = opts.junior
    ? `<div class="quiniela-card">
         <div class="quiniela-card-header">
           <h4 class="mb-0">Junior</h4>
           <span class="quiniela-sorteo-id">Sorteo N° ${opts.concurso}</span>
         </div>
         <div class="quiniela-card-body"><div class="quini6-balls">${opts.junior
           .map(bola)
           .join("")}</div></div>
       </div>`
    : ""
  return `<html><body>
    <p>Sorteo del <strong>${opts.fechaTexto ?? "27 de Septiembre de 2026"}</strong></p>
    <div class="quiniela-card">
      <div class="quiniela-card-header">
        <h4 class="mb-0">Tradicional</h4>
        <span class="quiniela-sorteo-id">Sorteo N° ${opts.concurso}</span>
      </div>
      <div class="quiniela-card-body"><div class="quini6-balls">${trad}</div></div>
    </div>
    ${juniorCard}
  </body></html>`
}

const HTML_SIN_RESULTADO = `<html><body>
  <p>No hay resultados de Brinco publicados para el <strong>4 de Octubre de 2026</strong>.</p>
</body></html>`

describe("brinco/scraper — parseo de CAS", () => {
  it("parsea concurso, Tradicional y Junior correctamente", () => {
    const r = parseBrincoCas(
      htmlConResultado({
        concurso: 1373,
        tradicional: [5, 20, 21, 26, 32, 38],
        junior: [2, 4, 11, 23, 28, 35],
      }),
      "2026-09-27",
      "https://cas.gob.ar/x",
    )
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.sorteo.concurso).toBe(1373)
    expect(r.sorteo.tradicional).toEqual([5, 20, 21, 26, 32, 38])
    expect(r.sorteo.junior).toEqual([2, 4, 11, 23, 28, 35])
    expect(r.sorteo.fecha).toBe("2026-09-27")
    expect(r.sorteo.fuente).toBe("cas-oficial")
  })

  it("parsea un sorteo sin Junior (junior null)", () => {
    const r = parseBrincoCas(
      htmlConResultado({ concurso: 900, tradicional: [1, 2, 3, 4, 5, 6], junior: null }),
      "2018-01-07",
      "u",
    )
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.sorteo.junior).toBeNull()
  })

  it("detecta 'no hay resultados publicados' como sin_resultado", () => {
    const r = parseBrincoCas(HTML_SIN_RESULTADO, "2026-10-04", "u")
    expect(r.status).toBe("sin_resultado")
  })

  it("devuelve error si falta el concurso", () => {
    const r = parseBrincoCas("<body>Tradicional<div class='quini6-ball'>05</div></body>", "2026-01-01", "u")
    expect(r.status).toBe("error")
  })

  it("devuelve error si el Tradicional no tiene 6 números válidos", () => {
    // Solo 3 bolillas → combinación inválida.
    const html = `<body><h4>Tradicional</h4>
      <div class="quini6-ball">05</div><div class="quini6-ball">10</div><div class="quini6-ball">15</div></body>`
    const r = parseBrincoCas(html, "2026-01-01", "u")
    expect(r.status).toBe("error")
  })

  it("un Junior inválido se descarta sin invalidar el Tradicional", () => {
    // Junior con un número fuera de rango (44) → se descarta, Tradicional ok.
    const html = htmlConResultado({ concurso: 1200, tradicional: [1, 2, 3, 4, 5, 6] })
      .replace(
        /<h4 class="mb-0">Junior<\/h4>[\s\S]*?quini6-balls">[\s\S]*?<\/div>\s*<\/div>/,
        `<h4 class="mb-0">Junior</h4><div class="quini6-balls">
           <div class="quini6-ball">44</div><div class="quini6-ball">01</div>
           <div class="quini6-ball">02</div><div class="quini6-ball">03</div>
           <div class="quini6-ball">04</div><div class="quini6-ball">05</div>
         </div>`,
      )
    const r = parseBrincoCas(html, "2024-06-09", "u")
    expect(r.status).toBe("ok")
    if (r.status !== "ok") return
    expect(r.sorteo.tradicional).toEqual([1, 2, 3, 4, 5, 6])
    expect(r.sorteo.junior).toBeNull() // inválido → descartado
  })
})
