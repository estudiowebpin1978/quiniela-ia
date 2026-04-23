import { NextRequest, NextResponse } from "next/server"

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/"/g, "").trim() || ""
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY?.replace(/"/g, "").trim() || ""

interface Draw {
  date: string
  turno: string
  numbers: number[]
}

function getFrecuencia(sequences: number[][], top = 20) {
  const freq: Record<number, number> = {}
  for (const seq of sequences) {
    for (const n of seq) freq[n] = (freq[n] || 0) + 1
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([n, c]) => ({ numero: parseInt(n), conteo: c }))
}

function getPares(sequences: number[][], top = 20) {
  const pares: Record<number, number> = {}
  for (const seq of sequences) {
    const unicos = [...new Set(seq)]
    for (let i = 0; i < unicos.length; i++) {
      for (let j = i + 1; j < unicos.length; j++) {
        const a = Math.min(unicos[i], unicos[j])
        const b = Math.max(unicos[i], unicos[j])
        const key = a * 100 + b
        pares[key] = (pares[key] || 0) + 1
      }
    }
  }
  return Object.entries(pares)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, c]) => ({ numeros: [Math.floor(parseInt(k) / 100), parseInt(k) % 100], conteo: c }))
}

function getPosiciones(sequences: number[][]) {
  const pos: Record<number, Record<number, number>> = {}
  for (const seq of sequences) {
    seq.forEach((n, i) => {
      if (!pos[n]) pos[n] = {}
      pos[n][i + 1] = (pos[n][i + 1] || 0) + 1
    })
  }
  const result: { numero: number; posicion: number; conteo: number; porcentaje: number }[] = []
  for (const [n, posiciones] of Object.entries(pos)) {
    for (const [p, c] of Object.entries(posiciones)) {
      result.push({
        numero: parseInt(n),
        posicion: parseInt(p),
        conteo: c,
        porcentaje: 0
      })
    }
  }
  return result.sort((a, b) => b.conteo - a.conteo).slice(0, 50)
}

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const turno = req.nextUrl.searchParams.get("turno")
  
  try {
    const res = await fetch(
      `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=200`,
      { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
    )
    const draws: Draw[] = await res.json()
    if (!draws?.length) {
      return NextResponse.json({ error: "Sin datos" })
    }

    const sequences = draws.map(d => d.numbers || [])
    const dates = draws.map(d => d.date)

    const porTurno: Record<string, {
      frecuencia: { numero: number; conteo: number }[]
      pares: { numeros: number[]; conteo: number }[]
      numerosCalientes: { numero: number; diasAusente: number }[]
      recent: { numero: number; ultimaFecha: string }[]
    }> = {}

    const turnos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
    for (const t of turnos) {
      const filtered = draws.filter(d => d.turno === t)
      const seqs = filtered.map(d => d.numbers || [])
      const dts = filtered.map(d => d.date)
      
      const freq = getFrecuencia(seqs, 20)
      const pares = getPares(seqs, 15)
      
      const numericos = new Set<number>()
      for (const s of seqs) s.forEach(n => numericos.add(n))
      
      const lastSeen: Record<number, string> = {}
      for (let i = 0; i < filtered.length; i++) {
        for (const n of filtered[i].numbers || []) {
          if (!lastSeen[n]) lastSeen[n] = filtered[i].date
        }
      }
      
      const calientes = [...numericos]
        .map(n => ({
          numero: n,
          diasAusente: lastSeen[n] ? Math.floor((new Date().getTime() - new Date(lastSeen[n]).getTime()) / 86400000) : 999
        }))
        .sort((a, b) => b.diasAusente - a.diasAusente)
        .slice(0, 20)

      porTurno[t] = {
        frecuencia: freq,
        pares: pares,
        numerosCalientes: calientes,
        recent: freq.slice(0, 10).map(f => ({ numero: f.numero, ultimaFecha: lastSeen[f.numero] || "N/A" }))
      }
    }

    const global = {
      frecuencia: getFrecuencia(sequences, 30),
      pares: getPares(sequences, 25),
      totalSorteos: draws.length,
      fechaInicio: draws[draws.length - 1]?.date,
      fechaFin: draws[0]?.date
    }

    if (turno && porTurno[turno]) {
      return NextResponse.json({ turno: turno, ...porTurno[turno] })
    }

    return NextResponse.json({
      global,
      porTurno,
      stats: {
        total: draws.length,
        turnos: turnos.map(t => draws.filter(d => d.turno === t).length)
      }
    })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}