/**
 * Motor de calibración Bayesiana Beta-Binomial (LOTBA — Ciudad).
 * 
 * Estima la probabilidad de que un número de 2 cifras aparezca en las primeras
 * 10 posiciones (top-10) y en las 20 posiciones (top-20) del extracto
 * oficial, con prior fuerte regularizador + decaimiento exponencial sobre
 * el histórico.
 *
 * HONESTIDAD: esto es un estimador bayesiano SUAVIZADO. No hay evidencia
 * OOS de que supere al azar — así lo reporta el backtest. Se respeta en la
 * UI: "no hay ventaja demostrada sobre el azar".
 *
 * Determinista — misma entrada misma salida. Sin Math.random.
 */
export interface CandidatoCalibrado {
  numero: string
  p10: number
  p20: number
  lift10: number
  lift20: number
}

const P10_BASE = 1 - Math.pow(0.99, 10) // ≈ 0.0956
const P20_BASE = 1 - Math.pow(0.99, 20) // ≈ 0.1821

export interface ConfigBayes {
  lambdaDecay?: number    // decaimiento exponencial (por sorteo desde el más reciente)
  fuerzaPrior?: number    // pseudo-observaciones del prior
}

/**
 * `sorteos` = lista ordenada CRONOLOGICAMENTE (más viejo primero).
 * Ventana de entrenamiento: los últimos `ventana` sorteos anteriores al objetivo.
 */
export function calcularProbabilidadesBeta(
  sorteos2CasStr: string[][],
  objetivoIdx: number,
  cfg: ConfigBayes = {},
): CandidatoCalibrado[] {
  const lambdaDecay = cfg.lambdaDecay ?? 0.004
  const fuerzaPrior = cfg.fuerzaPrior ?? 250

  // El objetivo es objetivoIdx; entrenamos sobre [0, objetivoIdx)
  const train = sorteos2CasStr.slice(0, objetivoIdx)
  const N = train.length
  if (N === 0) throw new Error("train vacío")

  // Ventana con decaimiento: w = exp(-lambda * distancia) desde el más reciente
  let pesoTotal = 0
  const w = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const distancia = N - 1 - i
    w[i] = Math.exp(-lambdaDecay * distancia)
    pesoTotal += w[i]
  }

  const exitos10 = new Float64Array(100)
  const exitos20 = new Float64Array(100)

  for (let i = 0; i < N; i++) {
    const uni10 = new Set<number>()
    const uni20 = new Set<number>()
    for (let pos = 0; pos < Math.min(20, train[i].length); pos++) {
      const n = Number.parseInt(train[i][pos], 10)
      if (!Number.isFinite(n) || n < 0 || n > 99) continue
      uni20.add(n)
      if (pos < 10) uni10.add(n)
    }
    for (const n of uni10) exitos10[n] += w[i]
    for (const n of uni20) exitos20[n] += w[i]
  }

  const out: CandidatoCalibrado[] = []
  const a10 = fuerzaPrior * P10_BASE
  const b10 = fuerzaPrior * (1 - P10_BASE)
  const a20 = fuerzaPrior * P20_BASE
  const b20 = fuerzaPrior * (1 - P20_BASE)

  for (let n = 0; n < 100; n++) {
    const p10 = (a10 + exitos10[n]) / (fuerzaPrior + pesoTotal)
    const p20 = (a20 + exitos20[n]) / (fuerzaPrior + pesoTotal)
    out.push({
      numero: String(n).padStart(2, "0"),
      p10,
      p20,
      lift10: p10 / P10_BASE - 1,
      lift20: p20 / P20_BASE - 1,
    })
  }
  return out
}

/**
 * Selecciona A, B, C, D según densidad calibrada + co-ocurrencia real ponderada
 * con prior regularizador (evita perseguir rachas).
 *
 * Regla (misma estructura que el Plan Operativo del producto):
 *   A = mejor P10 calibrada
 *   B = mejor P10 con prior ajuste por co-ocurrencia con A (peso 0.15, suave)
 *   C = mejor P20 fuera de {A, B} boosted por co-ocurrencia con A
 *   D = mejor P20 fuera de {A, B, C}
 */
export function seleccionarAnchorsBayes(
  sorteosStr: string[][],
  objetivoIdx: number,
  cfg: ConfigBayes & { pesoCoocurrencia?: number } = {},
): { A: CandidatoCalibrado; B: CandidatoCalibrado; C: CandidatoCalibrado; D: CandidatoCalibrado } {
  const pesoCoocurrencia = cfg.pesoCoocurrencia ?? 0.15
  const train = sorteosStr.slice(0, objetivoIdx)
  const N = train.length
  const lambdaDecay = cfg.lambdaDecay ?? 0.004
  const fuerzaPrior = cfg.fuerzaPrior ?? 250

  let pesoTotal = 0
  const w = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    w[i] = Math.exp(-lambdaDecay * (N - 1 - i))
    pesoTotal += w[i]
  }

  // Matriz de co-ocurrencia ponderada sobre el extracto de 20
  const coo = new Float64Array(100 * 100)
  for (let i = 0; i < N; i++) {
    const uni = new Set<number>()
    for (let pos = 0; pos < Math.min(20, train[i].length); pos++) {
      const n = Number.parseInt(train[i][pos], 10)
      if (Number.isFinite(n) && n >= 0 && n <= 99) uni.add(n)
    }
    const arr = [...uni]
    for (let a = 0; a < arr.length; a++) {
      for (let b = a + 1; b < arr.length; b++) {
        coo[arr[a] * 100 + arr[b]] += w[i]
        coo[arr[b] * 100 + arr[a]] += w[i]
      }
    }
  }

  const candidatos = calcularProbabilidadesBeta(sorteosStr, objetivoIdx, cfg)

  const p10of = (n: number) => candidatos[n].p10
  const p20of = (n: number) => candidatos[n].p20
  // prior co-ocurrencia: frecuencia esperado ≈ P20 * P20; suma prior fuerte como antes de learn
  const cooNorm = (a: number, b: number) => (fuerzaPrior * P20_BASE * P20_BASE + coo[a * 100 + b]) / (fuerzaPrior + pesoTotal)

  const Aidx = [...Array(100).keys()].sort((a, b) => p10of(b) - p10of(a))[0]
  // B: balance P10 + co-ocurrencia con A, penalizada por tamaño de muestra
  const Bidx = [...Array(100).keys()]
    .filter((n) => n !== Aidx)
    .sort((a, b) => p10of(b) * (1 + pesoCoocurrencia * (cooNorm(Aidx, b) / (p20of(Aidx) * p20of(b)) - 1)) -
                     p10of(a) * (1 + pesoCoocurrencia * (cooNorm(Aidx, a) / (p20of(Aidx) * p20of(a)) - 1)))
    [0]
  const CDPool = [...Array(100).keys()].filter((n) => n !== Aidx && n !== Bidx)
  const CD = CDPool
    .map((n) => ({ n, score: p20of(n) * (1 + pesoCoocurrencia * (cooNorm(Aidx, n) / (p20of(Aidx) * p20of(n)) - 1)) }))
    .sort((x, y) => y.score - x.score)
  const Cidx = CD[0].n
  const Didx = CD[1].n

  return { A: candidatos[Aidx], B: candidatos[Bidx], C: candidatos[Cidx], D: candidatos[Didx] }
}

export const P10_BASE_VALOR = P10_BASE
export const P20_BASE_VALOR = P20_BASE
