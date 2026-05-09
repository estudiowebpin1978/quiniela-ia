#!/usr/bin/env node

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkomfotl.supabase.co"
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""

const API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFjayIsInJlZiI6Indhemt5bHhncWNramZrb21mb3RsIiwiaWF0IjoxNjMxMjM0Njc3fQ.f7LnMjjJ8Tio1M3rLgLWM6T1L2T1L2T1L2T1L2T1L2T"

async function queryDatabase() {
  console.log("=== Verificando Base de Datos Supabase ===\n")
  console.log("URL:", SB.replace(/".*"/g, '***'))
  console.log("")

  const headers = {
    "apikey": API_KEY,
    "Authorization": `Bearer ${API_KEY}`
  }

  try {
    console.log("1. Contando registros totales...")
    const countRes = await fetch(`${SB}/rest/v1/draws?select=count`, {
      ...headers,
      headers: { ...headers, "Prefer": "count=exact" }
    })
    const countHeader = countRes.headers.get("content-range")
    console.log("   Total registros:", countHeader || "No disponible")

    console.log("\n2. Últimos 5 sorteos:")
    const recentRes = await fetch(`${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc,turno&limit=10`, { headers })
    const recentData = await recentRes.json()
    
    if (Array.isArray(recentData) && recentData.length > 0) {
      recentData.forEach((row, i) => {
        console.log(`   ${i + 1}. ${row.date} - ${row.turno}: ${row.numbers?.length || 0} números`)
      })
    } else {
      console.log("   Sin datos o error:", JSON.stringify(recentData).slice(0, 200))
    }

    console.log("\n3. Fechas únicas disponibles:")
    const datesRes = await fetch(`${SB}/rest/v1/draws?select=date&order=date.desc&limit=100`, { headers })
    const datesData = await datesRes.json()
    
    if (Array.isArray(datesData)) {
      const uniqueDates = [...new Set(datesData.map(d => d.date))]
      console.log(`   Total: ${uniqueDates.length} fechas únicas`)
      console.log("   Primeras 5:", uniqueDates.slice(0, 5).join(", "))
      console.log("   Últimas 5:", uniqueDates.slice(-5).join(", "))
    }

    console.log("\n4. Distribución por turno:")
    const turnosRes = await fetch(`${SB}/rest/v1/draws?select=turno&order=turno`, { headers })
    const turnosData = await turnosRes.json()
    
    if (Array.isArray(turnosData)) {
      const counts = {}
      turnosData.forEach(t => {
        counts[t.turno] = (counts[t.turno] || 0) + 1
      })
      Object.entries(counts).forEach(([turno, count]) => {
        console.log(`   ${turno}: ${count} registros`)
      })
    }

    console.log("\n5. Verificando datos del turno 'previa':")
    const previaRes = await fetch(`${SB}/rest/v1/draws?turno=eq.previa&select=date,numbers&order=date.desc&limit=3`, { headers })
    const previaData = await previaRes.json()
    
    if (Array.isArray(previaData)) {
      console.log(`   Registros: ${previaData.length}`)
      previaData.slice(0, 2).forEach(row => {
        console.log(`   ${row.date}: ${row.numbers?.slice(0, 5).join(", ")}...`)
      })
    }

    console.log("\n=== Resumen ===")
    if (Array.isArray(datesData) && datesData.length > 0) {
      const uniqueDates = [...new Set(datesData.map(d => d.date))]
      console.log("✓ Base de datos TIENE datos históricos")
      console.log(`  - ${uniqueDates.length} fechas únicas`)
      console.log(`  - ${Array.isArray(datesData) ? datesData.length : 0} sorteos totales`)
    } else {
      console.log("✗ Base de datos VACÍA o sin datos")
    }

  } catch (err) {
    console.error("ERROR:", err.message)
  }
}

queryDatabase()