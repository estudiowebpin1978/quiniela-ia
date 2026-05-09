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
    
    const turnos = [
      { id: "nocturna", nombre: "Nocturna" },
      { id: "vespertina", nombre: "Vespertina" },
      { id: "matutina", nombre: "Matutina" },
      { id: "primera", nombre: "Primera" },
      { id: "previa", nombre: "Previa" }
    ]
    
    const todosNumeros: string[] = []
    const numRegex = /<div class="numero">(\d{4})<\/div>/g
    let match
    
    while ((match = numRegex.exec(html)) !== null) {
      todosNumeros.push(match[1])
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
