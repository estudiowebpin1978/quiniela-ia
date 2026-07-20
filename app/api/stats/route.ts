import { NextRequest, NextResponse } from "next/server"
import { getSupabaseUrl, getSupabaseKey } from "@/lib/config"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const SB = getSupabaseUrl()
  const SK = getSupabaseKey()
  if (!SB || !SK) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })

  try {
    // Use RPC for aggregated stats instead of fetching 50k rows
    const statsRes = await fetch(`${SB}/rest/v1/rpc/get_draw_stats`, {
      method: "POST",
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}`, "Content-Type": "application/json" },
      body: JSON.stringify({})
    })

    if (statsRes.ok) {
      const stats = await statsRes.json()
      if (stats && typeof stats === 'object' && stats.total_sorteos !== undefined) {
        return NextResponse.json(stats)
      }
    }

    // Fallback: fetch recent draws only (last 5000 instead of 50000)
    const drawsRes = await fetch(`${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=5000`, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` }
    })
    const rows: any[] = await drawsRes.json()
    if (!rows?.length) return NextResponse.json({ totalSorteos: 0, mensaje: "Sin datos" })

    const turnos = ["previa", "primera", "matutina", "vespertina", "nocturna"]
    const terminaciones: number[] = []
    const porTurno: Record<string, number> = {}
    const dates = new Set<string>()

    for (const row of rows) {
      if (Array.isArray(row.numbers)) {
        dates.add(row.date)
        const t = (row.turno || "").toLowerCase()
        porTurno[t] = (porTurno[t] || 0) + 1
        for (const n of row.numbers) terminaciones.push(Number(n) % 100)
      }
    }

    const freq: Record<number, number> = {}
    for (const t of terminaciones) freq[t] = (freq[t] || 0) + 1

    const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1])
    const top5 = sorted.slice(0, 5).map(([k, v]) => ({ numero: k.padStart(2, "0"), frecuencia: v }))
    const cold = sorted.slice(-5).reverse().map(([k, v]) => ({ numero: k.padStart(2, "0"), frecuencia: v }))

    const fechasOrdenadas = [...dates].sort()
    const racha = (() => {
      let streak = 0
      const hoy = new Date()
      for (let i = 0; i < 30; i++) {
        const d = new Date(hoy)
        d.setDate(d.getDate() - i)
        const ds = d.toISOString().split("T")[0]
        if (fechasOrdenadas.includes(ds)) streak++
        else if (d.getDay() !== 0) break
      }
      return streak
    })()

    const pct = Math.round((sorted.filter(([, v]) => v > terminaciones.length / 100 / 2).length / 100) * 100)

    return NextResponse.json({
      totalSorteos: rows.length,
      fechasUnicas: dates.size,
      totalTerminaciones: terminaciones.length,
      top5MasFrecuentes: top5,
      top5MenosFrecuentes: cold,
      rachaDiasConsecutivos: racha,
      precisionEstimada: pct,
      porTurno,
      ultimaActualizacion: rows[0]?.date || "N/A",
      mensaje: `${rows.length} sorteos · ${dates.size} fechas · ${porTurno[turnos[0]] || 0} previas · ${porTurno[turnos[1]] || 0} primeras · ${porTurno[turnos[2]] || 0} matutinas · ${porTurno[turnos[3]] || 0} vespertinas · ${porTurno[turnos[4]] || 0} nocturnas`
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Error" }, { status: 500 })
  }
}
