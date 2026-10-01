/**
 * Poceada Historical Backfill Script
 *
 * Fetches historical Poceada draws from multiple sources and loads them into the database.
 * Run: npx tsx scripts/backfill-poceada.ts
 *
 * Sources:
 *   - ruta1000.com.ar (main, most reliable)
 *   - lanacion.com.ar (supplementary)
 */

import { createClient } from "@supabase/supabase-js"
import {
  fetchPoceadaHistorical,
  fetchPoceadaHistoricalLaNacion,
  type PoceadaDraw,
} from "../lib/scrapers/poceada"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || ""

const POCEADA_GAME_ID = "d0e1f2a3-b4c5-6789-0abc-def012345678"

async function main() {
  console.log("🎰 Poceada Historical Backfill")
  console.log("=".repeat(50))

  if (!SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_SERVICE_ROLE_KEY")
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // 1. Fetch from ruta1000 (primary)
  console.log("\n📡 Fetching from ruta1000.com.ar...")
  const rutaDraws = await fetchPoceadaHistorical()
  console.log(`   Found ${rutaDraws.length} draws from ruta1000`)

  // 2. Fetch from lanacion (supplementary)
  console.log("\n📡 Fetching from lanacion.com.ar...")
  const lanacionDraws = await fetchPoceadaHistoricalLaNacion()
  console.log(`   Found ${lanacionDraws.length} draws from lanacion`)

  // 3. Merge and deduplicate
  const allDraws = new Map<string, PoceadaDraw>()

  // Ruta1000 is primary
  for (const draw of rutaDraws) {
    allDraws.set(draw.date, draw)
  }

  // LaNacion fills gaps
  for (const draw of lanacionDraws) {
    if (!allDraws.has(draw.date)) {
      allDraws.set(draw.date, draw)
    }
  }

  const sortedDraws = Array.from(allDraws.values()).sort((a, b) => a.date.localeCompare(b.date))
  console.log(`\n📊 Total unique draws: ${sortedDraws.length}`)

  if (sortedDraws.length === 0) {
    console.log("⚠️  No draws found. Check network connectivity.")
    process.exit(0)
  }

  // Show date range
  console.log(`   Date range: ${sortedDraws[0].date} → ${sortedDraws[sortedDraws.length - 1].date}`)

  // 4. Check existing draws in DB
  console.log("\n🔍 Checking existing draws in database...")
  const { data: existing } = await supabase
    .from("draws")
    .select("date")
    .eq("game_id", POCEADA_GAME_ID)

  const existingDates = new Set(existing?.map(d => d.date) || [])
  const newDraws = sortedDraws.filter(d => !existingDates.has(d.date))
  console.log(`   Existing: ${existingDates.size} | New: ${newDraws.length}`)

  if (newDraws.length === 0) {
    console.log("\n✅ All draws already in database!")
    return
  }

  // 5. Insert new draws
  console.log(`\n💾 Inserting ${newDraws.length} new draws...`)
  let inserted = 0
  let errors = 0

  for (const draw of newDraws) {
    try {
      const { error } = await supabase.rpc("upsert_draw" as never, {
        p_date: draw.date,
        p_turno: "Poceada",
        p_numbers: draw.numbers,
        p_source: draw.source,
        p_game_id: POCEADA_GAME_ID,
        p_jurisdiccion: "ciudad",
      } as never)

      if (error) {
        console.error(`   ❌ ${draw.date}: ${error.message}`)
        errors++
      } else {
        inserted++
        if (inserted % 10 === 0) {
          console.log(`   ✅ Inserted ${inserted}/${newDraws.length}...`)
        }
      }
    } catch (e) {
      console.error(`   ❌ ${draw.date}: ${String(e)}`)
      errors++
    }
  }

  console.log(`\n${"=".repeat(50)}`)
  console.log(`✅ Inserted: ${inserted} | ❌ Errors: ${errors}`)
  console.log(`📊 Total Poceada draws in DB: ${existingDates.size + inserted}`)

  // 6. Show sample
  if (newDraws.length > 0) {
    console.log("\n📋 Sample draws:")
    for (const draw of newDraws.slice(0, 5)) {
      console.log(`   ${draw.date}: [${draw.numbers.join(", ")}] (${draw.source})`)
    }
    if (newDraws.length > 5) {
      console.log(`   ... and ${newDraws.length - 5} more`)
    }
  }
}

main().catch(e => {
  console.error("Fatal error:", e)
  process.exit(1)
})
