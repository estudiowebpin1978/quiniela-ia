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
    
    if (!res.ok) {
      console.error(`HTTP ${res.status}`)
      return {}
    }
    
    const html = await res.text()
    
    // Buscar todos los turnos y sus números
    // El HTML tiene estructura: <div id="nocturna" class="turno"><h2>...</h2></div>
    // Luego viene <div class="columna"> con los números
    
    const turnos = [
      { id: "nocturna", nombre: "Nocturna" },
      { id: "vespertina", nombre: "Vespertina" },
      { id: "matutina", nombre: "Matutina" },
      { id: "primera", nombre: "Primera" },
      { id: "previa", nombre: "Previa" }
    ]
    
    for (const turno of turnos) {
      // Buscar el bloque que contiene este turno
      // El patrón es: div id="turno" seguido de div class="columna" con los números
      
      const regex = new RegExp(
        `<div id="${turno.id}"[^>]*>.*?</div>[\\s\\S]*?<div class="columna">[\\s\\S]*?</div>`,
        "i"
      )
      
      const match = html.match(regex)
      if (match) {
        const bloque = match[0]
        // Extraer todos los números de 4 dígitos
        const nums: number[] = []
        const numRegex = /<div class="numero">(\d{4})<\/div>/g
        let m
        
        while ((m = numRegex.exec(bloque)) !== null) {
          nums.push(parseInt(m[1]))
        }
        
        if (nums.length === 20) {
          results[turno.nombre] = nums
          console.log(`Parsed ${turno.nombre}: ${nums.length} números`)
        } else {
          console.log(`Turno ${turno.nombre}: Solo ${nums.length} números encontrados`)
        }
      } else {
        console.log(`No se encontró bloque para ${turno.nombre}`)
      }
    }
    
  } catch (e) {
    console.error("Error scraping:", e)
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
            console.log(`Guardado: ${fechaISO} ${turno}`)
          }
        } else {
          console.log(`Ya existe: ${fechaISO} ${turno}`)
        }
      } catch (e) {
        console.error(`Error en ${turno}:`, e)
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