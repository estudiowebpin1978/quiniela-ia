/**
 * Respaldo / verificación oficial LOTBA - Poceada
 * Usa https://poceada.loteriadelaciudad.gob.ar/#resultados
 */
import { createClient } from "@supabase/supabase-js"

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""

async function fetchPoceadaOfficial() {
  const res = await fetch("https://poceada.loteriadelaciudad.gob.ar/", {
    headers: { "User-Agent": "Quiniela-IA-Verify/1.0" },
  })
  if (!res.ok) throw new Error(`Poceada fetch failed: ${res.status}`)
  return res.text()
}

function extractSorteos(html: string) {
  // Poceada usa números de sorteo propios (ej. 9717, 9716...)
  const regex = /Sorteo\s+Nº\s+(\d+)/gi
  const draws: { sorteo: number }[] = []
  let m
  while ((m = regex.exec(html)) !== null) {
    draws.push({ sorteo: parseInt(m[1], 10) })
  }
  return draws
}

export async function verifyPoceadaOfficial() {
  if (!SB_URL || !SB_KEY) throw new Error("Missing Supabase env")
  const supabase = createClient(SB_URL, SB_KEY)
  const html = await fetchPoceadaOfficial()
  const official = extractSorteos(html)

  // Últimos sorteos poceada en DB
  const { data: dbRows } = await supabase
    .from("draws")
    .select("date, turno, numbers")
    .eq("game_id", "d0e1f2a3-b4c5-6789-0abc-def012345678")
    .eq("turno", "Poceada")
    .order("date", { ascending: false })
    .limit(30)

  const dbDraws = dbRows || []
  const dbDates = new Set(dbDraws.map((d: { date: string }) => d.date))

  // Necesitamos fechas: extraer pares fecha+sorteo del home (no solo números)
  const pairs: { fecha: string; sorteo: number }[] = []
  const fwd = /(\d{2})\/(\d{2})\/(\d{4})[\s\S]{0,300}?Sorteo\s+N[º°o]\s*(\d+)/g
  let m: RegExpExecArray | null
  while ((m = fwd.exec(html)) !== null) {
    pairs.push({ fecha: `${m[3]}-${m[2]}-${m[1]}`, sorteo: parseInt(m[4], 10) })
  }

  const missing = pairs.filter((p) => !dbDates.has(p.fecha))

  console.log("POCEADA LOTBA official latest sorteos:", official.slice(-5).map(d => d.sorteo).join(", "))
  console.log("DB Poceada latest:", dbDraws.map((d: { date: string }) => d.date).slice(0, 8).join(", ") || "none")
  console.log("Official dates:", pairs.length, "| Missing in DB:", missing.length, missing.map(p => `${p.fecha} (sorteo ${p.sorteo})`).join(", "))
  return { official, pairs, dbDraws, missing }
}

if (require.main === module) {
  verifyPoceadaOfficial()
    .then((r) => {
      console.log(r.missing.length === 0 ? "Poceada verification OK" : `Poceada verification: ${r.missing.length} missing`)
      process.exit(r.missing.length > 0 ? 1 : 0)
    })
    .catch((e) => {
      console.error("Poceada verification error:", e.message)
      process.exit(1)
    })
}
