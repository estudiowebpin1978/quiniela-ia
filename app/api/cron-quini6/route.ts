import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Primera", "Matutina", "Vespertina", "Nocturna"]

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function parseDate(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${dd}-${m}-${y}`
}

function parseDateISO(d: Date) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

async function scrapeQuini6(fecha: string): Promise<Record<string, number[]>> {
  try {
    const url = `https://www.quini-6-resultados.com.ar/quinielas/nacional/sorteo-${fecha}.htm`
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return {}
    
    const html = await res.text()
    const results: Record<string, number[]> = {}
    
    // Extraer todos los números de 4 cifras
    const allNums: number[] = []
    const numRegex = /(\d{4})/g
    let m
    while ((m = numRegex.exec(html)) !== null) {
      const n = parseInt(m[1])
      if (n >= 100 && n <= 9999) allNums.push(n)
    }
    
    // Los primeros 20 son Previa, luego 20 Primera, etc.
    // Ajustar según lo que encontremos
    if (allNums.length >= 20) {
      // Intentar separar por turnos (buscarHeaders en HTML)
      // Primera posición después del título
      const sections: Record<string, number[]> = {}
      
      // Dividir por secciones según aparición en HTML
      // Simplified: tomar los primeros 80 números como 4 turnos
      if (allNums.length >= 20) results["Previa"] = allNums.slice(0, 20)
      if (allNums.length >= 40) results["Primera"] = allNums.slice(20, 40)
      if (allNums.length >= 60) results["Matutina"] = allNums.slice(40, 60)
      if (allNums.length >= 80) results["Vespertina"] = allNums.slice(60, 80)
      if (allNums.length >= 100) results["Nocturna"] = allNums.slice(80, 100)
    }
    
    return results
  } catch (e) {
    console.log("Error:", e)
    return {}
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const save = req.nextUrl.searchParams.get("save") === "true"
  const dias = parseInt(req.nextUrl.searchParams.get("dias") || "30")
  
  const results: any[] = []
  let totalGuardados = 0
  
  for (let i = 0; i < dias; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const fechaUrl = parseDate(d)
    const fechaISO = parseDateISO(d)
    
    const sorteos = await scrapeQuini6(fechaUrl)
    
    if (save && Object.keys(sorteos).length > 0) {
      for (const [turno, numeros] of Object.entries(sorteos)) {
        const check = await fetch(`${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=id`, {
          headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }
        })
        const existing = await check.json()
        
        if (!Array.isArray(existing) || existing.length === 0) {
          const r = await fetch(`${SB()}/rest/v1/draws`, {
            method: "POST",
            headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}`, "Content-Type": "application/json", "Prefer": "return=minimal" },
            body: JSON.stringify({ date: fechaISO, turno, numbers: numeros })
          })
          if (r.ok) totalGuardados++
        }
      }
    }
    
    results.push({ fecha: fechaUrl, sorteos: Object.keys(sorteos).length })
    
    if (i % 10 === 0) console.log(`Día ${i}/${dias}: ${fechaUrl}`)
  }
  
  return NextResponse.json({
    ok: true,
    diasProcesados: dias,
    guardados: totalGuardados,
    sample: results.slice(0, 3)
  })
}