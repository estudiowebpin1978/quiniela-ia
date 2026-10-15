/**
 * Motor de evaluación PURO de números 00-99 para Poceada Federal.
 *
 * Sólo estadística DESCRIBITIVA sobre sorteos oficiales validados:
 *  · frecuencia histórica de todo el historial
 *  · frecuencia reciente (ventana) y ponderación exponencial temporal
 *  · desviación de la frecuencia observada vs la referencia teórica
 *  · evolución temporal (bins cronológicos) y tendencia
 *  · coocurrencias con regularización (empirical-Bayes hacia independencia)
 *  · tamaño de muestra e incertidumbre por estimación
 *
 * Referencia matemática: si cada extracto fuera una selección uniforme de 20
 * números distintos entre 100, la probabilidad marginal de cada número es
 * 20 %. Las desviaciones observadas pueden deberse al azar y NO constituyen
 * por sí solas ventaja predictiva. Nada de esto afirma que un número tenga
 * más probabilidad de salir en un sorteo independiente.
 */

export const PROBABILIDAD_MARGINAL_TEORICA = 0.2
export const VERSION_MOTOR = "pf-estadisticas-1.0.0"

export interface SorteoValidado {
  concurso: number
  fecha: string
  numeros: number[]
}

export interface NumeroEstadistica {
  numero: number
  apariciones: number
  muestra: number
  frecuenciaHistorica: number
  desviacionVsTeorica: number
  errorEstandar: number
  intervalo95: [number, number]
  frecuenciaReciente: number
  frecuenciaPonderada: number
  evolucion: number[]
  tendencia: number
  coocurrencia: number[]
  incertidumbre: "alta" | "media" | "baja"
}

export interface MotorEstadistico {
  version: string
  muestra: number
  desde: string
  hasta: string
  halflifeSorteos: number
  bins: number
  ventanaReciente: number
  porNumero: NumeroEstadistica[]
  resumenDistribucion: {
    decenasPromedio: number[] // 10 decenas: participación media por sorteo (0-1)
    pares: number // proporción de números pares entre los extraídos
    impares: number
  }
  nota: string
}

export interface OpcionesMotor {
  halflifeSorteos?: number
  bins?: number
  ventanaReciente?: number
  alphaCoocurrencia?: number
}

const NOTA =
  "Estadística descriptiva del historial oficial validado. La probabilidad marginal teórica " +
  "de cada número en un extracto de 20 sobre 100 es 20 %; las desviaciones observadas pueden " +
  " deberse al azar y no implican mayor probabilidad futura."

function media(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
}

/** Combinatoria C(n,k) estable (producto multiplicativo). */
export function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const m = Math.min(k, n - k)
  let r = 1
  for (let i = 1; i <= m; i++) r = (r * (n - m + i)) / i
  return r
}

/**
 * Probabilidad teórica (hipergeométrica) de acertar al menos k de tus 8
 * números en un extracto oficial de 20 sobre 100, bajo un sorteo justo.
 */
export function probabilidadTeorica(k: number): number {
  const total = comb(100, 20)
  let p = 0
  for (let j = k; j <= 8; j++) {
    p += (comb(8, j) * comb(92, 20 - j)) / total
  }
  return p
}

export function probabilidadesTeoricas(): {
  alMenos6: number
  alMenos7: number
  alMenos8: number
  exactamente8: number
} {
  return {
    alMenos6: probabilidadTeorica(6),
    alMenos7: probabilidadTeorica(7),
    alMenos8: probabilidadTeorica(8),
    exactamente8: (comb(8, 8) * comb(92, 12)) / comb(100, 20),
  }
}

/** Frecuencia con peso exponencial: peso = 0.5^(edad/halflife) (edad en sorteos). */
function frecuenciaPonderada(
  porSorteo: Uint8Array[],
  numero: number,
  halflife: number
): { freq: number; sumaPesos: number } {
  const n = porSorteo.length
  if (n === 0) return { freq: 0, sumaPesos: 0 }
  let num = 0
  let den = 0
  for (let t = 0; t < n; t++) {
    const peso = Math.pow(0.5, (n - 1 - t) / halflife)
    den += peso
    if (porSorteo[t][numero]) num += peso
  }
  return { freq: den > 0 ? num / den : 0, sumaPesos: den }
}

export function calcularMotor(
  sorteos: SorteoValidado[],
  opts: OpcionesMotor = {}
): MotorEstadistico {
  const halflife = opts.halflifeSorteos ?? 60
  const bins = Math.max(2, opts.bins ?? 5)
  const ventana = Math.max(10, opts.ventanaReciente ?? 100)
  const alpha = opts.alphaCoocurrencia ?? 20

  const ordenados = [...sorteos].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.concurso - b.concurso
  )
  const n = ordenados.length

  // Matriz binaria por sorteo (acceso O(1)); n razonable (< 5000).
  const matriz: Uint8Array[] = ordenados.map((s) => {
    const v = new Uint8Array(100)
    for (const x of s.numeros) if (x >= 0 && x < 100) v[x] = 1
    return v
  })

  const conteos = new Array<number>(100).fill(0)
  const cooc = Array.from({ length: 100 }, () => new Array<number>(100).fill(0))
  for (const fila of matriz) {
    const activos: number[] = []
    for (let i = 0; i < 100; i++) if (fila[i]) { conteos[i]++; activos.push(i) }
    for (let a = 0; a < activos.length; a++) {
      for (let b = a + 1; b < activos.length; b++) {
        cooc[activos[a]][activos[b]]++
        cooc[activos[b]][activos[a]]++
      }
    }
  }

  const desdeIdx = Math.max(0, n - ventana)
  const tamBin = Math.ceil(n / bins)

  const porNumero: NumeroEstadistica[] = []
  for (let i = 0; i < 100; i++) {
    const freqHist = n > 0 ? conteos[i] / n : 0
    const se = n > 0 ? Math.sqrt(Math.max(0, freqHist * (1 - freqHist)) / n) : 0
    let recientes = 0
    for (let t = desdeIdx; t < n; t++) recientes += matriz[t][i]
    const freqReciente = n > 0 ? recientes / (n - desdeIdx) : 0
    const ponderada = frecuenciaPonderada(matriz, i, halflife)

    const evolucion: number[] = []
    for (let b = 0; b < bins; b++) {
      const ini = b * tamBin
      const fin = Math.min(n, ini + tamBin)
      let c = 0
      const len = Math.max(1, fin - ini)
      for (let t = ini; t < fin; t++) c += matriz[t][i]
      evolucion.push(len > 0 ? c / len : 0)
    }
    const mitad = Math.max(1, Math.floor(bins / 2))
    const temprano = media(evolucion.slice(0, mitad))
    const tardio = media(evolucion.slice(-mitad))
    const tendencia = tardio - temprano

    // Coocurrencia regularizada hacia independencia:
    // pReg = (c_ij + alpha · n · p0²) / (n + alpha), p0 = 0.20.
    const coocReg = new Array<number>(100).fill(PROBABILIDAD_MARGINAL_TEORICA)
    for (let j = 0; j < 100; j++) {
      if (j === i) { coocReg[j] = 1; continue }
      const previo = alpha * n * PROBABILIDAD_MARGINAL_TEORICA * PROBABILIDAD_MARGINAL_TEORICA
      coocReg[j] = (cooc[i][j] + previo) / (n + alpha)
    }

    porNumero.push({
      numero: i,
      apariciones: conteos[i],
      muestra: n,
      frecuenciaHistorica: freqHist,
      desviacionVsTeorica: freqHist - PROBABILIDAD_MARGINAL_TEORICA,
      errorEstandar: se,
      intervalo95: [
        Math.max(0, freqHist - 1.96 * se),
        Math.min(1, freqHist + 1.96 * se),
      ],
      frecuenciaReciente: freqReciente,
      frecuenciaPonderada: ponderada.freq,
      evolucion,
      tendencia,
      coocurrencia: coocReg,
      incertidumbre: se > 0.04 ? "alta" : se > 0.015 ? "media" : "baja",
    })
  }

  // Resumen de distribución (descriptivo): participación por decena y paridad.
  const decenas = new Array<number>(10).fill(0)
  let pares = 0
  let impares = 0
  for (const fila of matriz) {
    for (let i = 0; i < 100; i++) {
      if (!fila[i]) continue
      decenas[Math.floor(i / 10)]++
      if (i % 2 === 0) pares++
      else impares++
    }
  }
  const totalNums = pares + impares || 1

  return {
    version: VERSION_MOTOR,
    muestra: n,
    desde: ordenados[0]?.fecha ?? "",
    hasta: ordenados[n - 1]?.fecha ?? "",
    halflifeSorteos: halflife,
    bins,
    ventanaReciente: ventana,
    porNumero,
    resumenDistribucion: {
      decenasPromedio: decenas.map((c) => (n > 0 ? c / n : 0)),
      pares: pares / totalNums,
      impares: impares / totalNums,
    },
    nota: NOTA,
  }
}
