import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

function formatDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0")
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const yyyy = d.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

function formatISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function scrapeLoteriasMundiales(fecha: string): Promise<Record<string, number[]>> {
  try {
    const url = `https://www.loteriasmundiales.com.ar/Quinielas/nacional-provincia?fecha=${fecha}`
    const res = await fetch(url, {
      headers: { 
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html"
      },
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) return {}
    
    const html = await res.text()
    const results: Record<string, number[]> = {}
    
    const numRegex = /<strong>(\d{4})<\/strong>/g
    const nums: number[] = []
    let match
    
    while ((match = numRegex.exec(html)) !== null) {
      const n = parseInt(match[1])
      if (n >= 100 && n <= 9999 && !nums.includes(n)) {
        nums.push(n)
      }
    }
    
    if (nums.length >= 20) {
      if (nums.length >= 20) results["Previa"] = nums.slice(0, 20)
      if (nums.length >= 40) results["Primera"] = nums.slice(20, 40)
      if (nums.length >= 60) results["Matutina"] = nums.slice(40, 60)
      if (nums.length >= 80) results["Vespertina"] = nums.slice(60, 80)
      if (nums.length >= 100) results["Nocturna"] = nums.slice(80, 100)
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
  
  const allResults: any[] = []
  let totalGuardados = 0
  
  for (let i = 0; i < dias; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const fechaUrl = formatDate(d)
    const fechaISO = formatISO(d)
    
    const sorteos = await scrapeLoteriasMundiales(fechaUrl)
    
    if (Object.keys(sorteos).length > 0) {
      allResults.push({ fecha: fechaUrl, turnos: Object.keys(sorteos).length })
      
      if (save) {
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
    }
  }
  
  return NextResponse.json({
    ok: true,
    diasProcesados: dias,
    guardados: totalGuardados,
    results: allResults.slice(0, 5)
  })
}