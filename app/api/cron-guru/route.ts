import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

async function scrapeGuru() {
  try {
    const res = await fetch("https://loteria.guru/resultados-loteria-argentina/ar-quiniela-buenos-aires/resultados-anteriores-quiniela-buenos-aires-ar", {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return []
    
    const html = await res.text()
    
    // Extraer todos los números de 4 cifras que no sean años recientes
    const numRegex = /\b(\d{4})\b/g
    const allNums: number[] = []
    let match
    while ((match = numRegex.exec(html)) !== null) {
      const n = parseInt(match[1])
      // Filtrar años (2020-2026) y números que empiezan con 0 si son muito bajos
      if (n >= 100 && n <= 9999 && (n < 2020 || n > 2026)) allNums.push(n)
    }
    
    // Agrupar de a 20
    const sorteos: number[][] = []
    for (let i = 0; i < allNums.length; i += 20) {
      const grupo = allNums.slice(i, i + 20)
      if (grupo.length >= 10) sorteos.push(grupo)
    }
    
    return sorteos
  } catch (e) {
    console.log("Error:", e)
    return []
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const save = req.nextUrl.searchParams.get("save") === "true"
  
  const sorteos = await scrapeGuru()
  
  if (save && sorteos.length > 0) {
    let guardados = 0
    const fechaHoy = new Date().toISOString().split("T")[0]
    
    for (let i = 0; i < Math.min(sorteos.length, 5); i++) {
      // Usar el turno basado en el índice
      const turno = TURNOS[i % 5]
      const numeros = sorteos[i]
      
      // Check if exists
      const check = await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaHoy}&turno=eq.${turno}&select=id`, {
        headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }
      })
      const existing = await check.json()
      
      if (!Array.isArray(existing) || existing.length === 0) {
        const r = await fetch(`${SB()}/rest/v1/draws`, {
          method: "POST",
          headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
          body: JSON.stringify({ date: fechaHoy, turno, numbers: numeros })
        })
        if (r.ok) guardados++
      }
    }
    
    return NextResponse.json({
      ok: true,
      sorteosFound: sorteos.length,
      guardados,
      message: `Se guardaron ${guardados} sorteos`
    })
  }
  
  return NextResponse.json({
    ok: true,
    sorteosFound: sorteos.length,
    sample: sorteos[0]?.slice(0, 10) || [],
    message: "Scraper funciona - agrega ?save=true para guardar"
  })
}
