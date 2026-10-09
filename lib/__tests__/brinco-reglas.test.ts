import { describe, it, expect } from "vitest"
import {
  validarCombinacion,
  normalizarNumeros,
  formatoMostrar,
  formatoCombinacion,
  contarAciertos,
  periodoJunior,
  aciertosPremiadosJunior,
  distribucionAzar,
  esperanzaAzar,
  combinatoria,
  BRINCO_COMBINACIONES,
} from "@/lib/brinco/reglas"

describe("brinco/reglas — validación de combinación", () => {
  it("acepta una jugada válida de 6 números distintos 00-39", () => {
    expect(validarCombinacion([0, 7, 15, 22, 31, 39]).ok).toBe(true)
  })

  it("rechaza menos de 6 números", () => {
    const r = validarCombinacion([1, 2, 3, 4, 5])
    expect(r.ok).toBe(false)
    expect(r.errores.join(" ")).toMatch(/exactamente 6/)
  })

  it("rechaza más de 6 números", () => {
    expect(validarCombinacion([1, 2, 3, 4, 5, 6, 7]).ok).toBe(false)
  })

  it("rechaza números repetidos", () => {
    const r = validarCombinacion([5, 5, 10, 20, 30, 39])
    expect(r.ok).toBe(false)
    expect(r.errores.join(" ")).toMatch(/repetidos/)
  })

  it("rechaza valores fuera del rango 00-39", () => {
    expect(validarCombinacion([0, 5, 10, 20, 30, 40]).ok).toBe(false) // 40 fuera
    expect(validarCombinacion([-1, 5, 10, 20, 30, 39]).ok).toBe(false) // -1 fuera
  })

  it("rechaza números no enteros", () => {
    expect(validarCombinacion([0, 5, 10, 20, 30, 39.5]).ok).toBe(false)
  })

  it("NUNCA usa el universo 00-99 de la Quiniela (99 es inválido en Brinco)", () => {
    expect(validarCombinacion([10, 20, 30, 50, 70, 99]).ok).toBe(false)
  })

  it("normaliza y valida enteros recibidos como strings", () => {
    expect(validarCombinacion(["00", "07", "15", "22", "31", "39"]).ok).toBe(true)
  })
})

describe("brinco/reglas — normalización y formato", () => {
  it("formatea a dos cifras: 00, 01, 09", () => {
    expect(formatoMostrar(0)).toBe("00")
    expect(formatoMostrar(1)).toBe("01")
    expect(formatoMostrar(9)).toBe("09")
    expect(formatoMostrar(39)).toBe("39")
  })

  it("normalizarNumeros devuelve enteros válidos", () => {
    expect(normalizarNumeros(["00", "09", 15])).toEqual([0, 9, 15])
    expect(normalizarNumeros([40])).toBeNull()
    expect(normalizarNumeros(["x"])).toBeNull()
  })

  it("formatoCombinacion ordena y formatea", () => {
    expect(formatoCombinacion([39, 0, 15])).toEqual(["00", "15", "39"])
  })
})

describe("brinco/reglas — período del Junior", () => {
  it("concurso < 1000 → sin Junior", () => {
    expect(periodoJunior("2018-01-07", 999)).toBe("sin_junior")
    expect(aciertosPremiadosJunior("sin_junior")).toEqual([])
  })

  it("concurso ≥1000 antes de 2023-05-01 → Junior solo 6 aciertos", () => {
    expect(periodoJunior("2021-06-06", 1150)).toBe("junior_solo_6")
    expect(aciertosPremiadosJunior("junior_solo_6")).toEqual([6])
  })

  it("desde 2023-05-01 → Junior Siempre Sale (6/5/4)", () => {
    expect(periodoJunior("2023-05-07", 1250)).toBe("junior_siempresale")
    expect(aciertosPremiadosJunior("junior_siempresale")).toEqual([4, 5, 6])
  })

  it("no aplica reglas actuales retrospectivamente a un concurso viejo", () => {
    // Un concurso de 2021 (≥1000) era "solo 6", aunque hoy sea Siempre Sale.
    expect(periodoJunior("2021-01-03", 1100)).toBe("junior_solo_6")
  })
})

describe("brinco/reglas — aciertos y probabilidades", () => {
  it("contarAciertos cuenta intersección sin importar el orden", () => {
    expect(contarAciertos([0, 7, 15, 22, 31, 39], [39, 15, 0, 5, 6, 7])).toBe(4)
    expect(contarAciertos([1, 2, 3, 4, 5, 6], [30, 31, 32, 33, 34, 35])).toBe(0)
  })

  it("C(40,6) = 3.838.380", () => {
    expect(combinatoria(40, 6)).toBe(BRINCO_COMBINACIONES)
    expect(BRINCO_COMBINACIONES).toBe(3838380)
  })

  it("la distribución del azar suma 1 y su esperanza es 0.9", () => {
    const dist = distribucionAzar()
    const suma = dist.reduce((a, b) => a + b, 0)
    expect(suma).toBeCloseTo(1, 6)
    const media = dist.reduce((a, b, k) => a + b * k, 0)
    expect(media).toBeCloseTo(esperanzaAzar(), 6)
    expect(esperanzaAzar()).toBeCloseTo(0.9, 6)
  })

  it("P(6 aciertos) del azar = 1/C(40,6)", () => {
    const dist = distribucionAzar()
    expect(dist[6]).toBeCloseTo(1 / BRINCO_COMBINACIONES, 12)
  })
})
