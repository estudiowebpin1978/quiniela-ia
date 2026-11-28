/**
 * Script de backfill para tablas de análisis de predicción (ES Module)
 *
 * Pobla:
 *  - redoblonas_ciudad_coocurrencia (desde draws de Quiniela Ciudad)
 *
 * REQUISITO: Ejecutar primero sql/migrations/TODAS_LAS_MIGRACIONES.sql en Supabase
 *
 * Uso:
 *   node scripts/backfill-analisis.js
 *
 * Requiere variables de entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ Faltan variables de entorno: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

function numerosDosCifras(nums) {
  const set = new Set()
  for (const n of nums) {
    const v = ((Math.trunc(Number(n)) % 100) + 100) % 100
    if (Number.isFinite(v)) set.add(v)
  }
  return [...set].sort((a, b) => a - b)
}

async function safeRpc(name, params) {
  try {
    const { data, error } = await supabase.rpc(name, params)
    if (error) {
      console.warn(`⚠️  RPC ${name} error:`, error.message)
      return { ok: false, error: error.message }
    }
    return { ok: true, data }
  } catch (e) {
    console.warn(`⚠️  RPC ${name} excepción:`, String(e))
    return { ok: false, error: String(e) }
  }
}

async function backfillRedoblonasCiudad() {
  console.log("🔄 Backfill redoblonas Ciudad...")

  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]

  for (const turno of turnos) {
    const { data: draws, error } = await supabase
      .from("draws")
      .select("date, numbers")
      .eq("turno", turno)
      .in("jurisdiccion", ["CABA", "ciudad", "51"])
      .order("date", { ascending: true })

    if (error || !draws) {
      console.warn(`⚠️  ${turno}: error leyendo draws:`, error ? error.message : "no data")
      continue
    }

    let paresProcesados = 0

    for (const draw of draws) {
      const nums = numerosDosCifras(draw.numbers || [])
      if (nums.length < 2) continue

      for (let i = 0; i < nums.length; i++) {
        for (let j = i + 1; j < nums.length; j++) {
          const a = nums[i]
          const b = nums[j]

          const { error: errUpsert } = await supabase
            .from("redoblonas_ciudad_coocurrencia")
            .upsert(
              {
                turno,
                numero_a: a,
                numero_b: b,
                veces_juntos: 1,
                ultima_aparicion: draw.date,
              },
              { onConflict: "turno,numero_a,numero_b" }
            )

          if (errUpsert) {
            console.warn(`⚠️  Upsert par ${a}-${b} falló:`, errUpsert.message)
            continue
          }
          paresProcesados++

          await safeRpc("incrementar_veces_juntos", {
            p_turno: turno,
            p_a: a,
            p_b: b,
          })
        }
      }
    }

    console.log(`✅ ${turno}: ${draws.length} sorteos, ${paresProcesados} pares procesados`)
  }
}

async function main() {
  console.log("🚀 Iniciando backfill de análisis de predicción\n")

  await backfillRedoblonasCiudad()

  console.log("\n✅ Backfill completado")
}

main().catch((err) => {
  console.error("❌ Error fatal:", err)
  process.exit(1)
})
