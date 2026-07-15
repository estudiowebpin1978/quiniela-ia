// ⚠️  ADVERTENCIA: Este script genera datos ALEATORIOS.
// NO USAR para poblar la base de datos en producción.
// Los datos aleatorios harán que las predicciones y resultados
// oficiales mostrados a los usuarios sean INCORRECTOS.
// Usar el scraper (/api/cron o /api/cron-nacional) para datos reales.

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""

if (!SB || !SK) {
  console.error("Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const headers = {
  "apikey": SK,
  "Authorization": "Bearer " + SK,
  "Content-Type": "application/json",
  "Prefer": "return=minimal"
}

function generateRandomDraw() {
  const nums = []
  while (nums.length < 20) {
    const n = Math.floor(Math.random() * 10000)
    if (!nums.includes(n)) nums.push(n)
  }
  return nums.sort(function() { return Math.random() - 0.5 })
}

function generateRandomDraw() {
  const nums = []
  while (nums.length < 20) {
    const n = Math.floor(Math.random() * 10000)
    if (!nums.includes(n)) nums.push(n)
  }
  return nums.sort(function() { return Math.random() - 0.5 })
}

async function seedDatabase() {
  console.log("=== Seed Database Quiniela ===\n")
  
  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
  const startDate = new Date("2025-01-01")
  const endDate = new Date("2026-05-09")
  
  let totalInserted = 0
  let currentDate = new Date(startDate)
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay()
    const month = currentDate.getMonth() + 1
    const day = currentDate.getDate()
    const dateStr = currentDate.toISOString().split("T")[0]
    
    if (dayOfWeek === 0) {
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }
    
    const isFeriado = ["01-01", "02-16", "02-17", "03-24", "04-02", "04-03", "05-01", "05-25", "06-20", "07-09", "12-08", "12-25"].includes(
      String(month).padStart(2, "0") + "-" + String(day).padStart(2, "0")
    )
    
    if (isFeriado) {
      currentDate.setDate(currentDate.getDate() + 1)
      continue
    }
    
    for (const turno of turnos) {
      try {
        const checkRes = await fetch(SB + "/rest/v1/draws?date=eq." + dateStr + "&turno=eq." + turno + "&select=id", { headers: { "apikey": SK, "Authorization": "Bearer " + SK } })
        const existing = await checkRes.json()
        
        if (!Array.isArray(existing) || existing.length === 0) {
          const nums = generateRandomDraw()
          const insertRes = await fetch(SB + "/rest/v1/draws", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({ date: dateStr, turno: turno, numbers: nums, source: "seed-script" })
          })
          
          if (insertRes.ok) {
            totalInserted++
            console.log("✓ " + dateStr + " " + turno)
          }
        }
      } catch (e) {
        console.error("Error: " + dateStr + " " + turno, e)
      }
    }
    
    currentDate.setDate(currentDate.getDate() + 1)
  }
  
  console.log("\n=== Total inserted: " + totalInserted + " ===")
  process.exit(0)
}

seedDatabase()