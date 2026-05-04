import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkomfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

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
    
    // Parsear cada turno basado en el HTML que vimos
    // Estructura: <div id="nocturna" class="turno"><h2>Nocturna Sábado 02/05/26</h2></div>
    // Luego hay divs con class="numero" que contienen los números
    
    const turnoIds = ["nocturna", "vespertina", "matutina", "primera", "previa"]
    const turnoNombres = ["Nocturna", "Vespertina", "Matutina", "Primera", "Previa"]
    
    for (let i = 0; i < turnoIds.length; i++) {
      const id = turnoIds[i]
      const nombre = turnoNombres[i]
      
      // Buscar el bloque de este turno
      const bloqueRegex = new RegExp(
        `<div id="${id}"[^>]*>.*?</div>.*?(<div class="columna">.*?</div>)`,
        "is"
      )
      
      const match = bloqueRegex.exec(html)
      if (match) {
        const bloque = match[1]
        // Extraer todos los números de 4 dígitos
        const numRegex = /<div class="numero">(\d{4})<\/div>/g
        const nums: number[] = []
        let m
        
        while ((m = numRegex.exec(bloque)) !== null) {
          nums.push(parseInt(m[1]))
        }
        
        if (nums.length === 20) {
          results[nombre] = nums
          console.log(`Parsed ${nombre}: ${nums.length} números`)
        }
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
  const desde = req.nextUrl.searchParams.get("desde") || "" // fecha inicio opcional
  
  let totalGuardados = 0
  const resultados: any = {}
  
  // Scrapear datos actuales
  const sorteos = await scrapeQuinielaNacional()
  resultados.hoy = { turnos: Object.keys(sorteos).length, datos: sorteos }
  
  if (save && Object.keys(sorteos).length > 0) {
    const fechaISO = formatISO(new Date())
    
    for (const [turno, numeros] of Object.entries(sorteos)) {
      try {
        // Verificar si ya existe este sorteo
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
          } else {
            console.log(`Error guardando ${turno}: ${insertRes.status}`)
          }
        } else {
          console.log(`Ya existe: ${fechaISO} ${turno}`)
        }
      } catch (e) {
        console.error(`Error en ${turno}:`, e)
      }
    }
  }
  
  // Si se especifica "desde", intentar cargar historial (fechas anteriores)
  if (desde && save) {
    resultados.historial = "Para cargar historial, se necesita iterar fechas manualmente desde la web"
  }
  
  return NextResponse.json({
    ok: true,
    guardados: totalGuardados,
    resultados,
    message: `Encontrados ${Object.keys(sorteos).length} turnos, guardados ${totalGuardados}`
  })
}