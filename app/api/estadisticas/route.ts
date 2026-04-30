import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const url = `${SB()}/rest/v1/draws?select=date&order=date.desc&limit=100`
    const res = await fetch(url, { 
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }
    })
    
    if (!res.ok) {
      return NextResponse.json({ 
        totalSorteos: 0, 
        pct: "--", 
        racha: "--", 
        mensaje: "Sin datos" 
      })
    }
    
    const rows = await res.json()
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ 
        totalSorteos: 0, 
        pct: "--", 
        racha: "--", 
        mensaje: "Sin datos" 
      })
    }
    
    const uniqueDates = [...new Set(rows.map((r: any) => r.date))]
    const totalSorteos = rows.length
    
    const dates = uniqueDates.slice(0, 10).sort().reverse()
    let racha = 0
    let currentDate = new Date()
    currentDate.setHours(0, 0, 0, 0)
    
    for (let i = 0; i < dates.length; i++) {
      const checkDate = new Date(currentDate)
      checkDate.setDate(checkDate.getDate() - i)
      const checkStr = checkDate.toISOString().split("T")[0]
      
      if (dates.includes(checkStr)) {
        racha++
      } else {
        break
      }
    }
    
    const mensaje = `${totalSorteos} sorteos · ${dates.length} días con datos`
    
    return NextResponse.json({
      totalSorteos,
      pct: "--",
      racha,
      mensaje,
      ultimosDias: dates.slice(0, 5)
    })
  } catch (e: any) {
    return NextResponse.json({ 
      totalSorteos: 0, 
      pct: "--", 
      racha: "--", 
      mensaje: "Error: " + e.message 
    })
  }
}