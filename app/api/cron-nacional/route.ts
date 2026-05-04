import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkomfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

function formatISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function scrapeQuinielaNacional(): Promise<Record<string, number[]>> {
  const results: Record<string, number[]> = {}
  
  try {
    const res = await fetch("https://quiniela-nacional.com/quinielanacional/", {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(30000)
    })
    
    if (!res.ok) return {}
    
    const html = await res.text()
    
    // Buscar secciones por el patrón: <div id="nocturna" class="turno">...<h2>...
    // Luego extraer los números que siguen
    
    const turnos = [
      { id: "nocturna", nombre: "Nocturna" },
      { id: "vespertina", nombre: "Vespertina" },
      { id: "matutina", nombre: "Matutina" },
      { id: "primera", nombre: "Primera" },
      { id: "previa", nombre: "Previa" }
    ]
    
    // Extraer todos los números de la página
    const todosNumeros: string[] = []
    const numRegex = /<div class="numero">(\d{4})<\/div>/g
    let match
    
    while ((match = numRegex.exec(html)) !== null) {
      todosNumeros.push(match[1])
    }
    
    console.log(`Total números encontrados: ${todosNumeros.length}`)
    
    // Si hay 100 números (5 turnos x 20 números), asignar por orden
    if (todosNumeros.length >= 100) {
      const porTurno = 20
      turnos.forEach((t, i) => {
        const inicio = i * porTurno
        const nums = todosNumeros.slice(inicio, inicio + porTurno).map(n => parseInt(n))
        if (nums.length === 20) {
          results[t.nombre] = nums
          console.log(`Asignado ${t.nombre}: ${nums.length} números`)
        }
      })
    } else if (todosNumeros.length > 0) {
      // Si no hay suficientes, al menos devolver lo que hay
      console.log(`Solo se encontraron ${todosNumeros.length} números`)
    }
    
  } catch (e) {
    console.error("Error:", e)
  }
  
  return results
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret") || ""
  const expected = process.env.CRON_SECRET || "quiniela_ia_cron_2024_seguro"
  
  if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  
  const save = req.nextUrl.searchParams.get("save") === "true"
  
  const sorteos = await scrapeQuinielaNacional()
  let totalGuardados = 0
  
  if (save && Object.keys(sorteos).length > 0) {
    const fechaISO = formatISO(new Date())
    
    for (const [turno, numeros] of Object.entries(sorteos)) {
      try {
        const checkRes = await fetch(
          `${SB()}/rest/v1/draws?date=eq.${fechaISO}&turno=eq.${turno}&select=id`,
          { 
            headers: { 
              "apikey": SK(), 
              "Authorization": `Bearer ${SK()}` 
            } 
          }
        )
        const existing = await checkRes.json()
        
        if (!Array.isArray(existing) || existing.length === 0) {
          const insertRes = await fetch(`${SB()}/rest/v1/draws`, {
            method: "POST",
            headers: { 
              "apikey": SK(), 
              "Authorization": `Bearer ${SK()}`, 
              "Content-Type": "application/json",
              "Prefer": "return=minimal"
            },
            body: JSON.stringify({ 
              date: fechaISO, 
              turno, 
              numbers: numeros,
              source: "quiniela-nacional.com"
            })
          })
          
          if (insertRes.ok) {
            totalGuardados++
          }
        }
      } catch (e) {
        console.error(e)
      }
    }
  }
  
  return NextResponse.json({
    ok: true,
    guardados: totalGuardados,
    sorteos,
    message: `Encontrados ${Object.keys(sorteos).length} turnos, guardados ${totalGuardados}`
  })
}
