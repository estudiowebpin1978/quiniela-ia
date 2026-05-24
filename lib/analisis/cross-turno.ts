const SB = "https://wazkylxgqckjfkcmfotl.supabase.co"
const SK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indhemt5bHhncWNramZrY21mb3RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI0Nzc1NSwiZXhwIjoyMDg3ODIzNzU1fQ.IiksS0WwZZVlx9XJCzLhswJzSeeWnNS0dp3Z5uZiCSs"

interface DrawRow {
  date: string;
  turno: string;
  numbers: number[];
}

const TURNOS_ORDER = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

async function fetchDraws(url: string): Promise<DrawRow[]> {
  try {
    const res = await fetch(url, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      signal: AbortSignal.timeout(8000)
    })
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

function turnoPrevio(turno: string): string | null {
  const idx = TURNOS_ORDER.indexOf(turno)
  if (idx > 0) return TURNOS_ORDER[idx - 1]
  return null
}

function esMismoDiaOPosterior(turno: string, turnoAnterior: string): boolean {
  const idx = TURNOS_ORDER.indexOf(turno)
  const idxPrev = TURNOS_ORDER.indexOf(turnoAnterior)
  return idxPrev >= 0 && idxPrev <= idx
}

export interface CrossTurnoResult {
  arrastreNocturnaPrevia: Set<number>;
  terminacionesRepetidas: Set<number>;
  numerosMultiTurno: Set<number>;
  crossTurnoScore: Record<number, number>;
}

export async function analisisCrossTurno(turno: string, diasAtras: number = 3): Promise<CrossTurnoResult> {
  const result: CrossTurnoResult = {
    arrastreNocturnaPrevia: new Set(),
    terminacionesRepetidas: new Set(),
    numerosMultiTurno: new Set(),
    crossTurnoScore: {}
  }

  const fechaHoy = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires", year: "numeric", month: "2-digit", day: "2-digit"
  }).format()

  const draws: DrawRow[] = []
  for (let d = 0; d < diasAtras; d++) {
    const f = new Date(fechaHoy + "T12:00:00-03:00")
    f.setDate(f.getDate() - d)
    const fechaStr = f.toISOString().split("T")[0]
    const url = `${SB}/rest/v1/draws?select=date,turno,numbers&date=eq.${fechaStr}&order=turno.asc`
    const rows = await fetchDraws(url)
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 5) {
        row.numbers = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        draws.push(row)
      }
    }
  }

  const hoyDraws = draws.filter(d => d.date === fechaHoy)
  const diasPrevios = draws.filter(d => d.date !== fechaHoy)

  const turnoActualIdx = TURNOS_ORDER.indexOf(turno)
  if (turnoActualIdx < 0) return result

  if (turno === "Previa") {
    for (const d of diasPrevios) {
      if (d.turno === "Nocturna") {
        for (const n of d.numbers) {
          result.arrastreNocturnaPrevia.add(n % 100)
        }
      }
    }
  }

  const turnosHoy = hoyDraws.filter(d => esMismoDiaOPosterior(d.turno, turno))
  const terminacionesHoy = new Set<number>()
  for (const d of turnosHoy) {
    for (const n of d.numbers) {
      terminacionesHoy.add(n % 100)
    }
  }

  for (const d of turnosHoy) {
    for (const n of d.numbers) {
      result.numerosMultiTurno.add(n % 100)
    }
  }

  for (let n = 0; n < 100; n++) {
    let scoreExtra = 0

    if (result.arrastreNocturnaPrevia.has(n)) {
      if (turno === "Previa") scoreExtra += 8
    }

    if (terminacionesHoy.has(n) && !turnosHoy.some(d => d.turno === turno && d.numbers.some(x => x % 100 === n))) {
      scoreExtra += 5
    }

    if (result.numerosMultiTurno.has(n)) {
      scoreExtra += 3
    }

    const previo = turnoPrevio(turno)
    if (previo) {
      const drawPrevio = hoyDraws.find(d => d.turno === previo)
      if (drawPrevio) {
        for (const numPrevio of drawPrevio.numbers) {
          if (numPrevio % 100 === n) {
            scoreExtra += 6
          }
          if (Math.floor(numPrevio / 10) % 10 === Math.floor(n / 10) || numPrevio % 10 === n % 10) {
            scoreExtra += 2
          }
        }
      }
    }

    result.crossTurnoScore[n] = scoreExtra
  }

  return result
}
