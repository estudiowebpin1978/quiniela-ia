// Motor avanzado de predicciones - Funciones adicionales
// No rompe el código existente, solo agrega nuevos factores

// Test de Rachas Wald-Wolfowitz - Detecta si un número está en racha estadísticamente significativa
export function runsTest(sequence: number[]): number {
  if (sequence.length < 10) return 0
  
  const sorted = [...sequence].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  
  const binary = sequence.map(v => v > median ? 1 : 0)
  let runs = 1
  
  for (let i = 1; i < binary.length; i++) {
    if (binary[i] !== binary[i - 1]) runs++
  }
  
  const n1 = binary.filter(x => x === 1).length
  const n2 = binary.length - n1
  
  if (n1 === 0 || n2 === 0) return 0
  
  const mean = (2 * n1 * n2) / (n1 + n2) + 1
  const variance = (2 * n1 * n2 * (2 * n1 * n2 - n1 - n2)) / Math.pow(n1 + n2, 2) * (n1 + n2 - 1)
  
  if (variance <= 0) return 0
  
  const z = (runs - mean) / Math.sqrt(variance)
  
  // Retorna score de racha: positivo = tendencia, negativo = aleatorio
  return Math.abs(z) > 1.96 ? z : 0 // Solo significativo si |z| > 1.96 (95% confianza)
}

// Matriz de co-ocurrencia para redoblona
export function computeCooccurrenceMatrix(draws: number[][]): Map<string, number> {
  const coocurrence = new Map<string, number>()
  
  for (let i = 1; i < draws.length; i++) {
    const prevDraw = draws[i - 1]
    const currDraw = draws[i]
    
    // Extraer pares: primeros 2 dígitos y últimos 2 dígitos
    const prevFirst = prevDraw[0] % 100
    const prevLast = prevDraw[prevDraw.length - 1] % 100
    const currFirst = currDraw[0] % 100
    const currLast = currDraw[currDraw.length - 1] % 100
    
    // Co-ocurrencia: par adelante -> par adelante siguiente
    const key1 = `${prevFirst}->${currFirst}`
    coocurrence.set(key1, (coocurrence.get(key1) || 0) + 1)
    
    // Co-ocurrencia: par atrás -> par atrás siguiente
    const key2 = `${prevLast}->${currLast}`
    coocurrence.set(key2, (coocurrence.get(key2) || 0) + 1)
  }
  
  return coocurrence
}

// Análisis por posiciones para 4 cifras
export function analyzePositions(draws: number[][]): {
  position0: { numero: string, score: number }[],
  position1: { numero: string, score: number }[],
  position2: { numero: string, score: number }[],
  position3: { numero: string, score: number }[]
} {
  const pos0Freq = new Array(10).fill(0)
  const pos1Freq = new Array(10).fill(0)
  const pos2Freq = new Array(10).fill(0)
  const pos3Freq = new Array(10).fill(0)
  
  for (const draw of draws) {
    for (let i = 0; i < Math.min(draw.length, 20); i++) {
      const n = draw[i]
      const d0 = Math.floor(n / 1000) % 10
      const d1 = Math.floor(n / 100) % 10
      const d2 = Math.floor(n / 10) % 10
      const d3 = n % 10
      
      pos0Freq[d0]++
      pos1Freq[d1]++
      pos2Freq[d2]++
      pos3Freq[d3]++
    }
  }
  
  const normalizeFreq = (freq: number[]) => {
    const max = Math.max(...freq)
    return freq.map(f => f / max)
  }
  
  const toTop3 = (freq: number[]) => {
    const norm = normalizeFreq(freq)
    return norm.map((score, num) => ({ numero: String(num), score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
  }
  
  return {
    position0: toTop3(pos0Freq),
    position1: toTop3(pos1Freq),
    position2: toTop3(pos2Freq),
    position3: toTop3(pos3Freq)
  }
}

// Generar 4 cifras combinando las posiciones más probables
export function generate4CifrasFromPositions(positions: {
  position0: { numero: string, score: number }[],
  position1: { numero: string, score: number }[],
  position2: { numero: string, score: number }[],
  position3: { numero: string, score: number }[]
}): string[] {
  const results: string[] = []
  
  // Generar combinaciones de los top de cada posición
  for (const p0 of positions.position0.slice(0, 2)) {
    for (const p1 of positions.position1.slice(0, 2)) {
      for (const p2 of positions.position2.slice(0, 2)) {
        for (const p3 of positions.position3.slice(0, 2)) {
          const num = p0.numero + p1.numero + p2.numero + p3.numero
          const score = p0.score * p1.score * p2.score * p3.score
          results.push(num.padStart(4, '0') + ':' + score.toFixed(4))
        }
      }
    }
  }
  
  // Ordenar por score y devolver top 5
  return results
    .sort((a, b) => parseFloat(b.split(':')[1]) - parseFloat(a.split(':')[0]))
    .slice(0, 5)
    .map(s => s.split(':')[0])
}

// Calcular precisión de predicciones vs resultados reales
export function calculateAccuracy(
  predictions: string[],
  actual: number[]
): { aciertos: number, precision: number, posiciones: number[] } {
  const aciertos = predictions.filter(p => 
    actual.some(a => String(a).padStart(4, '0').includes(p) || String(a % 100).padStart(2, '0') === p || String(a % 1000).padStart(3, '0') === p)
  ).length
  
  const precision = predictions.length > 0 ? (aciertos / predictions.length) * 100 : 0
  
  const posiciones = predictions.map(p => {
    const idx = actual.findIndex(a => 
      String(a).padStart(4, '0').includes(p) || String(a % 100).padStart(2, '0') === p || String(a % 1000).padStart(3, '0') === p
    )
    return idx >= 0 ? idx + 1 : -1
  })
  
  return { aciertos, precision, posiciones }
}