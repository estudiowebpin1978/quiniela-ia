/**
 * Respaldo / verificación de sorteos oficiales LOTBA
 * Usa https://quiniela.loteriadelaciudad.gob.ar/index.php?#resultados
 * Cuando resultados-data.php falla o para validar existencia antes de scrape.
 */
import { createClient } from "@supabase/supabase-js"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

async function fetchLotbaResults() {
  const url = "https://quiniela.loteriadelaciudad.gob.ar/index.php?#resultados"
  const res = await fetch(url, {
    headers: { "User-Agent": "Quiniela-IA-Verify/1.0" },
  })
  if (!res.ok) throw new Error(`LOTBA fetch failed: ${res.status}`)
  return res.text()
}

function extractDraws(html: string) {
  // Extraer entradas de resultados recientes del HTML de LOTBA
  // Formato observado: "25/09/2026 - 18:00 - Sorteo Nº 52955 - VESPERTINA"
  const regex = /(\d{2}\/\d{2}\/\d{4})\s+-\s+\d{2}:\d{2}\s+-\s+Sorteo\s+Nº\s+(\d+)\s+-\s+([A-ZÁÉÍÓÚÑ]+?)(?:\s+|<)/gi
  const draws = []
  let m
  while ((m = regex.exec(html)) !== null) {
    draws.push({ fecha: m[1], sorteo: parseInt(m[2], 10), turno: m[3].trim() })
  }
  return draws
}

export async function verifyOfficialDraws() {
  if (!SB_URL || !SB_KEY) throw new Error("Missing Supabase env")
  const supabase = createClient(SB_URL, SB_KEY)
  const html = await fetchLotbaResults()
  const official = extractDraws(html)

  // Últimos 12 días de sorteos quiniela en DB (fecha + turno)
  const { data: dbRows } = await supabase
    .from("draws")
    .select("date, turno, source")
    .eq("game_id", "ac593199-c299-4f03-b1b7-8675fe4fa6d9")
    .order("date", { ascending: false })
    .limit(60)

  const dbDraws = dbRows || []
  const toIso = (ddmmmyyyy: string) => {
    const [dd, mm, yyyy] = ddmmmyyyy.split("/")
    return `${yyyy}-${mm}-${dd}`
  }

  // Los 10 sorteos más recientes publicados por LOTBA deben existir en DB
  const missing: typeof official = []
  for (const o of official.slice(0, 10)) {
    const fechaIso = toIso(o.fecha)
    const dbMatch = dbDraws.find(
      (d) => d.date === fechaIso && d.turno?.toLowerCase() === o.turno.toLowerCase()
    )
    if (!dbMatch) missing.push(o)
  }

  console.log("LOTBA official draws (last 10):", official.length)
  console.log("DB quiniela draws checked:", dbDraws.length)
  console.log("Missing in DB:", missing.length, missing.map(d => `${d.turno} ${d.sorteo} (${d.fecha})`))

  return { official, dbDraws, missing }
}

// CLI
if (require.main === module) {
  verifyOfficialDraws()
    .then((r) => process.exit(r.missing.length > 0 ? 1 : 0))
    .catch((e) => { console.error(e); process.exit(1) })
}
