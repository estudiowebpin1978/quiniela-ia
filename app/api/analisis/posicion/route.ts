import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from '@/lib/supabase-client'
import logger from '@/lib/logger'

export const maxDuration = 30

const GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
const POCEADA_GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"
const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turnoRaw = searchParams.get("turno") || "Primera"
  const turno = TURNOS.includes(turnoRaw) ? turnoRaw : "Primera"
  const juegoId = turno === "Poceada" ? POCEADA_GAME_ID : GAME_ID
  const limite = Number(searchParams.get("limite")) || 200

  try {
    const supabase = getSupabaseAdmin()
    const { data: rows, error } = await supabase
      .from("draws")
      .select("date, numbers")
      .eq("turno", turno)
      .eq("game_id", juegoId)
      .order("date", { ascending: false })
      .limit(limite)

    if (error) throw new Error(error.message)
    const sorteos = Array.isArray(rows) ? rows : []
    const totalSorteos = sorteos.length

    if (totalSorteos === 0) {
      return NextResponse.json({ ok: true, turno, totalSorteosAnalizados: 0, posiciones: [], aviso: "Sin datos suficientes" })
    }

    const posiciones = []
    for (let pos = 1; pos <= 20; pos++) {
      const frec: Record<number, number> = {}
      const ultima: Record<number, string | null> = {}
      for (let n = 0; n < 100; n++) frec[n] = 0
      sorteos.forEach((s: any) => {
        const nums = Array.isArray(s.numbers) ? s.numbers : []
        const val = nums[pos - 1]
        if (typeof val === "number" && val >= 0 && val <= 99) {
          frec[val] = (frec[val] || 0) + 1
          ultima[val] = s.date
        }
      })
      const frecuente = Object.entries(frec)
        .filter(([, v]) => v > 0)
        .map(([num, veces]) => ({ numero: Number(num).toString().padStart(2, "0"), veces, pct: Math.round((veces / totalSorteos) * 1000) / 10 }))
        .sort((a, b) => b.veces - a.veces).slice(0, 5)
      const atrasado = Object.entries(ultima)
        .map(([num]) => {
          const nNum = Number(num)
          const ua = ultima[nNum] ?? null
          return {
            numero: num.toString().padStart(2, "0"),
            sorteosAtraso: ua ? sorteos.filter((s: any) => s.date > ua).length : totalSorteos,
            ultimaAparicion: ua,
          }
        })
        .sort((a, b) => b.sorteosAtraso - a.sorteosAtraso).slice(0, 5)
      posiciones.push({ posicion: pos, frecuente, atrasado, totalSorteos })
    }

    return NextResponse.json({ ok: true, turno, juego: turno === "Poceada" ? "Poceada Federal" : "Quiniela Nacional", totalSorteosAnalizados: totalSorteos, posiciones, aviso: "Análisis estadístico por posición. No garantiza acierto." })
  } catch (e: any) {
    logger.error("[analisis-posicion] error", { error: String(e), turno })
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 })
  }
}
