import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

function pad(n: number, l = 2): string {
  return String(n).padStart(l, "0")
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "30"), 1), 90)
  const turno = searchParams.get("turno") || "Nocturna"
  const topN = Math.min(Math.max(parseInt(searchParams.get("top") || "10"), 1), 20)

  try {
    const desde = new Date(Date.now() - days * 86400000).toISOString().split("T")[0]
    const hasta = new Date(Date.now() - 86400000).toISOString().split("T")[0]

    const res = await fetch(
      `${SB()}/rest/v1/draws?date=gte.${desde}&date=lte.${hasta}&turno=ilike.*${turno.toLowerCase()}*&select=date,turno,numbers&order=date.desc&limit=10000`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` } }
    )
    const rows: any[] = await res.json()
    if (!rows.length) return NextResponse.json({ error: `Sin datos para ${turno} en ${days} días` }, { status: 404 })

    const sequences: number[][] = []
    const dates: string[] = []
    for (const row of rows) {
      if (Array.isArray(row.numbers) && row.numbers.length >= 20) {
        const nums = row.numbers.map((n: number) => Number(n)).filter((n: number) => !isNaN(n) && n >= 0 && n <= 9999)
        if (nums.length >= 20) {
          sequences.push(nums)
          dates.push(row.date)
        }
      }
    }

    if (sequences.length < 5) return NextResponse.json({ error: "Sorteos insuficientes para backtest" }, { status: 400 })

    const terminaciones: number[] = []
    for (const seq of sequences) {
      for (const n of seq) terminaciones.push(n % 100)
    }

    const freq: Record<number, number> = {}
    for (const t of terminaciones) freq[t] = (freq[t] || 0) + 1

    const sorted = Object.entries(freq)
      .map(([k, v]) => ({ num: parseInt(k), freq: v }))
      .sort((a, b) => b.freq - a.freq)

    const topPredict = sorted.slice(0, topN).map(x => pad(x.num))
    let aciertosTotales = 0
    let sorteosConAcierto = 0

    for (let i = 0; i < sequences.length; i++) {
      const actual = sequences[i].map(n => pad(n % 100))
      const hits = topPredict.filter(n => actual.includes(n))
      if (hits.length > 0) {
        aciertosTotales += hits.length
        sorteosConAcierto++
      }
    }

    const totalSorteos = sequences.length
    const hitRate = Math.round((sorteosConAcierto / totalSorteos) * 100)
    const avgHits = (aciertosTotales / totalSorteos).toFixed(2)

    return NextResponse.json({
      ok: true,
      params: { days, turno, topN },
      totalSorteos,
      topPredict,
      aciertosTotales,
      sorteosConAcierto,
      hitRate,
      avgHits,
      conclusion: hitRate > 50
        ? `El patrón de frecuencia muestra ${hitRate}% de aciertos en ${totalSorteos} sorteos.`
        : `La frecuencia histórica dio ${hitRate}% de aciertos sobre ${totalSorteos} sorteos.`
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 })
  }
}