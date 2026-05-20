import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET() {
  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()
  if (!SB || !SK) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })

  try {
    const drawsRes = await fetch(`${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=50000`, {
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
        else if (d.getDay() !== 0) break // domingos no cuentan
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
