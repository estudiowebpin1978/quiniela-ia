const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export interface PesosDinamicos {
  frecuencia: number;
  posicion: number;
  recencia: number;
  tendencia: number;
  ciclo: number;
  coocurrencia: number;
  ausencia: number;
  caliente: number;
  atrasado: number;
  correlacionTurno: number;
  paridad: number;
  sumaDigitos: number;
  crossTurno: number;
}

const PESOS_BASE: PesosDinamicos = {
  frecuencia: 0.15, posicion: 0.09, recencia: 0.12, tendencia: 0.09,
  ciclo: 0.09, coocurrencia: 0.07, ausencia: 0.07, caliente: 0.05,
  atrasado: 0.04, correlacionTurno: 0.05, paridad: 0.03, sumaDigitos: 0.03,
  crossTurno: 0.12
}

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

async function fetchDraws(turno: string, limit: number = 100): Promise<number[][]> {
  const url = `${SB()}/rest/v1/draws?select=numbers,turno&turno=ilike.*${turno}*&order=date.desc&limit=${limit}`
  try {
    const res = await fetch(url, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return []
    const rows: any[] = await res.json()
    return rows
      .filter((r: any) => Array.isArray(r.numbers) && r.numbers.length >= 5)
      .map((r: any) => r.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999))
  } catch {
    return []
  }
}

function calcularFreq(draws: number[][]): number[] {
  const freq: number[] = new Array(100).fill(0)
  for (const d of draws) for (const n of d) freq[n % 100]++
  return freq
}

function scoreFactor(n: number, freq: number[], total: number, paridadMayor: string, topSuma: Set<number>): number {
  return Math.min(100, (freq[n] / Math.max(1, total)) * 10000)
}

export async function calcularPesosDinamicos(turno: string): Promise<PesosDinamicos> {
  try {
    const draws = await fetchDraws(turno, 100)
    if (draws.length < 10) return { ...PESOS_BASE }

    const mitades = Math.floor(draws.length / 2)
    const recientes = draws.slice(0, mitades)
    const antiguos = draws.slice(mitades)

    if (recientes.length < 5) return { ...PESOS_BASE }

    const freqReciente = calcularFreq(recientes)
    const freqAntiguos = calcularFreq(antiguos)
    const totalReciente = recientes.length * 20
    const totalAntiguos = antiguos.length * 20

    const hitsPorFactor: Record<string, number> = {
      frecuencia: 0, posicion: 0, recencia: 0, tendencia: 0,
      coocurrencia: 0, ausencia: 0, caliente: 0, atrasado: 0,
      paridad: 0, sumaDigitos: 0
    }
    const intentosPorFactor: Record<string, number> = {
      frecuencia: 0, posicion: 0, recencia: 0, tendencia: 0,
      coocurrencia: 0, ausencia: 0, caliente: 0, atrasado: 0,
      paridad: 0, sumaDigitos: 0
    }

    const paridad = { pares: 0, impares: 0 }
    for (const d of recientes) for (const n of d) { (n % 2 === 0) ? paridad.pares++ : paridad.impares++ }
    const paridadMayor = paridad.pares >= paridad.impares ? "par" : "impar"

    for (const d of recientes) {
      const terminaciones = new Set(Array.from(d, n => n % 100))
      if (terminaciones.size === 0) continue

      const topFreq = Object.entries(freqReciente).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => parseInt(k))
      for (const t of terminaciones) if (topFreq.includes(t)) hitsPorFactor.frecuencia++
      intentosPorFactor.frecuencia++

      const topRecencia = Object.entries(freqReciente).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k]) => parseInt(k))
      for (const t of terminaciones) if (topRecencia.includes(t)) hitsPorFactor.recencia++
      intentosPorFactor.recencia++

      const freqAnt = Object.entries(freqAntiguos).sort((a, b) => b[1] - a[1]).slice(0, 10)
      const freqRec = Object.entries(freqReciente).sort((a, b) => b[1] - a[1]).slice(0, 10)
      const tendenciaSet = new Set(freqRec.filter(([k]) => {
        const fAnt = freqAntiguos[parseInt(k)] || 0
        return (freqReciente[parseInt(k)] || 0) > fAnt * 1.2
      }).map(([k]) => parseInt(k)))
      for (const t of terminaciones) if (tendenciaSet.has(t)) hitsPorFactor.tendencia++
      intentosPorFactor.tendencia++

      const sumaTop = new Set(
        Object.entries(recientes.flat().reduce((acc: Record<number, number>, n) => {
          const s = Math.floor(n % 100 / 10) + (n % 100 % 10); acc[s] = (acc[s] || 0) + 1; return acc
        }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => parseInt(k))
      )
      for (const t of terminaciones) {
        const s = Math.floor(t / 10) + (t % 10)
        if (sumaTop.has(s)) hitsPorFactor.sumaDigitos++
      }
      intentosPorFactor.sumaDigitos++
    }

    const efectividad: Record<string, number> = {}
    for (const key of Object.keys(hitsPorFactor)) {
      efectividad[key] = intentosPorFactor[key] > 0 ? hitsPorFactor[key] / intentosPorFactor[key] : 0
    }

    const pesos: PesosDinamicos = { ...PESOS_BASE }

    pesos.frecuencia = PESOS_BASE.frecuencia * (1 + (efectividad.frecuencia - 0.15) * 2)
    pesos.recencia = PESOS_BASE.recencia * (1 + (efectividad.recencia - 0.15) * 2)
    pesos.tendencia = PESOS_BASE.tendencia * (1 + (efectividad.tendencia - 0.12) * 2)
    pesos.caliente = Math.max(0.02, PESOS_BASE.caliente * (1 + (efectividad.caliente - 0.1) * 2))
    pesos.atrasado = Math.max(0.02, PESOS_BASE.atrasado * (1 + (efectividad.atrasado - 0.1) * 2))
    pesos.sumaDigitos = Math.max(0.01, PESOS_BASE.sumaDigitos * (1 + (efectividad.sumaDigitos - 0.08) * 2))

    const total = Object.values(pesos).reduce((a, b) => a + b, 0)
    for (const key of Object.keys(pesos) as (keyof PesosDinamicos)[]) {
      pesos[key] = Math.round((pesos[key] / total) * 1000) / 1000
    }

    return pesos
  } catch {
    return { ...PESOS_BASE }
  }
}

export function pesosABase(): PesosDinamicos {
  return { ...PESOS_BASE }
}
