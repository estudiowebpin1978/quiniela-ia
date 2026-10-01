/**
 * Poceada Historical Backfill — LOTBA oficial (fuente primaria)
 *
 * Fuente: https://poceada.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=N
 * Devuelve JS con window.RESULTADOS_DATA = [{sorteo, fecha, numeros_juegos:{Tradicional:[20 nums]}}]
 * Los sorteos son secuenciales (Mon-Sat 21:00 ART).
 *
 * Run: npx tsx scripts/backfill-poceada-lotba.ts [fromSorteo] [toSorteo]
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const POCEADA_GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
const BASE = "https://poceada.loteriadelaciudad.gob.ar/includes/resultados-data.php"

interface LotbaDraw {
  sorteo: number
  date: string
  numbers: number[]
}

function parseResultados(text: string): LotbaDraw | null {
  const m = text.match(/window\.RESULTADOS_DATA\s*=\s*(\[[\s\S]*?\]);/)
  if (!m) return null
  let arr: Array<{
    sorteo: number
    fecha: string
    numeros_juegos?: Record<string, string[]>
  }>
  try {
    arr = JSON.parse(m[1])
  } catch {
    return null
  }
  const item = arr[0]
  if (!item || !item.fecha || !item.numeros_juegos) return null
  const nums = item.numeros_juegos["Tradicional"] || item.numeros_juegos["tradicional"]
  if (!Array.isArray(nums) || nums.length !== 20) return null
  const [dd, mm, yyyy] = item.fecha.split("/")
  if (!dd || !mm || !yyyy) return null
  const numbers = nums.map((s) => parseInt(s, 10))
  if (numbers.some((n) => Number.isNaN(n) || n < 0 || n > 99)) return null
  return { sorteo: item.sorteo, date: `${yyyy}-${mm}-${dd}`, numbers }
}

async function fetchSorteo(sorteo: number): Promise<LotbaDraw | null> {
  try {
    const resp = await fetch(`${BASE}?sorteo=${sorteo}`, {
      headers: { "User-Agent": UA, Accept: "*/*" },
      signal: AbortSignal.timeout(12000),
    })
    if (!resp.ok) return null
    const text = await resp.text()
    const draw = parseResultados(text)
    if (draw && draw.sorteo !== sorteo) return null
    return draw
  } catch {
    return null
  }
}

async function main() {
  const from = parseInt(process.argv[2] || "8800", 10)
  const to = parseInt(process.argv[3] || "9727", 10)

  console.log("🎰 Poceada Backfill — LOTBA oficial")
  console.log(`   sorteos ${from}..${to} (${to - from + 1} requests)`)
  if (!SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  const { data: existing } = await supabase
    .from("draws")
    .select("date")
    .eq("game_id", POCEADA_GAME_ID)
  const existingDates = new Set((existing || []).map((d) => d.date as string))
  console.log(`   existing in DB: ${existingDates.size}`)

  // Fetch with limited concurrency
  const CONCURRENCY = 8
  const draws: LotbaDraw[] = []
  const seen = new Set<string>()
  let errors = 0
  const allSorteos: number[] = []
  for (let s = to; s >= from; s--) allSorteos.push(s)

  let cursor = 0
  async function worker() {
    while (cursor < allSorteos.length) {
      const i = cursor++
      const d = await fetchSorteo(allSorteos[i])
      if (d) {
        if (!seen.has(d.date)) {
          seen.add(d.date)
          draws.push(d)
        }
      } else {
        errors++
      }
      if ((i + 1) % 100 === 0) console.log(`   fetched ${i + 1}/${allSorteos.length} (ok=${draws.length}, err=${errors})`)
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
  draws.sort((a, b) => a.date.localeCompare(b.date))
  console.log(`\n📊 fetched ${draws.length} unique draws, ${errors} failed, range ${draws[0]?.date} → ${draws[draws.length - 1]?.date}`)

  const fresh = draws.filter((d) => !existingDates.has(d.date))
  console.log(`   new to insert: ${fresh.length}`)

  let inserted = 0
  let insErrors = 0
  for (const d of fresh) {
    try {
      const { error } = await supabase.rpc("upsert_draw" as never, {
        p_date: d.date,
        p_turno: "Poceada",
        p_numbers: d.numbers,
        p_source: "lotba-oficial",
        p_game_id: POCEADA_GAME_ID,
        p_jurisdiccion: "ciudad",
      } as never)
      if (error) {
        insErrors++
        if (insErrors <= 5) console.error(`   ❌ ${d.date}: ${error.message}`)
      } else {
        inserted++
      }
    } catch (e) {
      insErrors++
      if (insErrors <= 5) console.error(`   ❌ ${d.date}: ${String(e)}`)
    }
    if (inserted > 0 && inserted % 100 === 0) console.log(`   ✅ inserted ${inserted}/${fresh.length}...`)
  }

  const { count } = await supabase
    .from("draws")
    .select("date", { count: "exact", head: true })
    .eq("game_id", POCEADA_GAME_ID)
  console.log(`\n✅ inserted=${inserted} errors=${insErrors} | total Poceada draws in DB: ${count}`)
}

main().catch((e) => {
  console.error("Fatal:", e)
  process.exit(1)
})
