import { NextRequest, NextResponse } from "next/server"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

function formatISO(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

async function scrapeQuinielaNacional(): Promise<Record<string, number[]>> {
  const results: Record<string, number[]> = {}
  const debug = process.env.DEBUG_SCRAPE === "true"
  
  try {
    const res = await fetch("https://quinielanacional1.com.ar/", {
      headers: { 
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        "Referer": "https://quinielanacional1.com.ar/",
        "Upgrade-Insecure-Requests": "1"
      },
      signal: AbortSignal.timeout(30000)
    })
    
    const html = await res.text()
    console.log("[FETCH] Status:", res.status, "| Content-Type:", res.headers.get("content-type"), "| HTML length:", html.length)
    
    if (!res.ok) {
      console.error("[FETCH ERROR] Status:", res.status, res.statusText)
      console.log("[FETCH ERROR] Response body (first 500):", html.substring(0, 500))
      return {}
    }
    
    if (debug) {
      console.log("=== DIAGNOSTIC INFO (debug mode) ===")
      console.log("First 2000 chars:", html.substring(0, 2000))
      console.log("======================")
    }
    
    const turnos = [
      { id: "Previa", nombre: "Previa" },
      { id: "Primera", nombre: "Primera" },
      { id: "Matutina", nombre: "Matutina" },
      { id: "Vespertina", nombre: "Vespertina" },
      { id: "Nocturna", nombre: "Nocturna" }
    ]
    
    const todosNumeros: string[] = []
    const numRegex = /<div class="numero">(\d{4})<\/div>/g
    let match
    
    while ((match = numRegex.exec(html)) !== null) {
      todosNumeros.push(match[1])
    }
    
    console.log("Números encontrados con regex class='numero':", todosNumeros.length)
    
    if (todosNumeros.length === 0 || todosNumeros.length < 100) {
      const altRegex = /(\d{4})/g
      const allNumbers = []
      let altMatch
      while ((altMatch = altRegex.exec(html)) !== null) {
        allNumbers.push(altMatch[1])
      }
      console.log("[FALLO] Números encontrados:", todosNumeros.length, "| Total 4-dígitos:", allNumbers.length)
      console.log("[FALLO] Muestra números:", allNumbers.slice(0, 20))
      console.log("[FALLO] HTML length:", html.length, "| Has class='numero':", html.includes('class="numero"'))
      console.log("[FALLO] Status:", res.status, "| Content-Type:", res.headers.get("content-type"))
      console.log("=== First 500 chars of HTML (always shown on failure) ===")
      console.log(html.substring(0, 500))
      console.log("=== Last 500 chars of HTML ===")
      console.log(html.substring(html.length - 500))
    }
    
    if (todosNumeros.length >= 100) {
      const porTurno = 20
      turnos.forEach((t, i) => {
        const inicio = i * porTurno
        const nums = todosNumeros.slice(inicio, inicio + porTurno).map(n => parseInt(n))
        if (nums.length === 20) {
          results[t.nombre] = nums
        }
      })
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
  const turnoParam = req.nextUrl.searchParams.get("turno") || "" // NUEVO: parámetro turno
  
  // Verificar si hoy es domingo o feriado 2026
  const ahora = new Date()
  const ar = new Date(ahora.getTime() - 3 * 3600000)
  const diaSemana = ar.getDay()
  const mes = ar.getMonth() + 1
  const dia = ar.getDate()
  
  const feriados2026 = [
    "01-01", "02-16", "02-17", "03-24", "04-02", "04-03",
    "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"
  ]
  
  const fechaHoy = `${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
  
  if (diaSemana === 0) {
    return NextResponse.json({
      ok: false,
      message: "Domingo - No hay sorteos",
      guardados: 0
    })
  }
  
  if (feriados2026.includes(fechaHoy)) {
    return NextResponse.json({
      ok: false,
      message: `Feriado ${fechaHoy} - No hay sorteos`,
      guardados: 0
    })
  }
  
  const sorteos = await scrapeQuinielaNacional()
  
  if (Object.keys(sorteos).length === 0) {
    return NextResponse.json({
      ok: false,
      message: "No se encontraron sorteos en la página",
      guardados: 0
    })
  }
  
  let totalGuardados = 0
  
  if (save) {
    const fechaISO = formatISO(new Date())
    
    // Si se especifica turno, solo procesar ese turno
    const turnosProcesar = turnoParam 
      ? Object.entries(sorteos).filter(([t]) => 
          t.toLowerCase() === turnoParam.toLowerCase())
      : Object.entries(sorteos)
    
    if (turnoParam && turnosProcesar.length === 0) {
      return NextResponse.json({
        ok: false,
        message: `Turno "${turnoParam}" no encontrado en los datos scrapeados`,
        guardados: 0,
        turnosDisponibles: Object.keys(sorteos)
      })
    }
    
    for (const [turno, numeros] of turnosProcesar) {
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
            console.log(`Guardado ${turno}: ${numeros.length} números`)
          }
        } else {
          console.log(`Ya existe ${turno} para ${fechaISO}`)
        }
      } catch (e) {
        console.error(e)
      }
    }
  }
  
  return NextResponse.json({
    ok: true,
    guardados: totalGuardados,
    sorteos: turnoParam ? { [turnoParam]: sorteos[turnoParam] } : sorteos,
    message: turnoParam 
      ? `Turno ${turnoParam}: ${totalGuardados} guardado(s)`
      : `Encontrados ${Object.keys(sorteos).length} turnos, guardados ${totalGuardados}`
  })
}
