/**
 * Brinco Backfill — importador histórico desde la fuente CAS (cas.gob.ar).
 *
 * Dry-run por defecto (solo clasifica, no escribe). Pasar --apply para escribir.
 * Reanudable: salta fechas ya importadas. Idempotente: no duplica concursos.
 *
 * Ejemplos:
 *   npx tsx scripts/brinco-backfill.ts                       # últimos 22 domingos (dry-run)
 *   npx tsx scripts/brinco-backfill.ts --desde=2026-05-03 --hasta=2026-09-27 --apply
 *   npx tsx scripts/brinco-backfill.ts --domingos=8 --apply
 *
 * NOTA: el archivo accesible de CAS alcanza ~Mayo-Sept 2026. No hay historial
 * completo desde el año 2000 disponible por HTTP simple.
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

// Cargar .env.local sin imprimir valores.
function cargarEnv(): void {
  const p = resolve(process.cwd(), ".env.local")
  if (!existsSync(p)) return
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    const key = m[1]
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env)) process.env[key] = val
  }
}

cargarEnv()

// Importar DESPUÉS de cargar env (los módulos leen process.env al usar).
import { backfillFechas, domingosEntre, ultimosDomingos } from "../lib/brinco/importar"
import { brincoStoreSupabase } from "../lib/brinco/store"

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split("=")[1] : undefined
}
function has(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[brinco-backfill] Faltan SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL en .env.local")
    process.exit(1)
  }

  const desde = arg("desde")
  const hasta = arg("hasta")
  const domingosArg = arg("domingos")
  const apply = has("apply")

  let fechas: string[]
  if (desde && hasta) {
    fechas = domingosEntre(desde, hasta)
  } else {
    const n = domingosArg ? parseInt(domingosArg, 10) : 22
    fechas = ultimosDomingos(n)
  }

  console.log(`[brinco-backfill] ${fechas.length} domingos · ${fechas[0]} → ${fechas[fechas.length - 1]}`)
  console.log(`[brinco-backfill] modo: ${apply ? "APPLY (escribe)" : "DRY-RUN (solo clasifica)"}`)

  const store = brincoStoreSupabase()
  const informe = await backfillFechas(fechas, store, {
    apply,
    concurrency: 2,
    pausaMs: 350,
    omitirExistentes: true,
  })

  console.log("\n── Informe de importación ─────────────────────────────")
  console.log(`Fechas procesadas : ${informe.total_fechas}`)
  console.log(`Importados        : ${informe.importados}`)
  console.log(`Duplicados omit.  : ${informe.omitidos_duplicados}`)
  console.log(`Conflictos        : ${informe.conflictos}`)
  console.log(`Rechazados        : ${informe.rechazados}`)
  console.log(`Sin resultado     : ${informe.sin_resultado}`)
  console.log(`Errores de fuente : ${informe.errores}`)

  const faltantes = informe.detalles.filter(
    (d) => d.status === "sin_resultado" || d.status === "error",
  )
  if (faltantes.length > 0) {
    console.log(`\nFaltantes / no publicados (${faltantes.length}):`)
    for (const f of faltantes.slice(0, 40)) {
      console.log(`  - ${f.fecha} ${f.motivo ? `(${f.motivo})` : ""}`.trim())
    }
  }
  const conflictos = informe.detalles.filter((d) => d.status === "conflicto")
  if (conflictos.length > 0) {
    console.log(`\nConflictos a auditar (${conflictos.length}):`)
    for (const c of conflictos.slice(0, 40)) {
      console.log(`  - ${c.fecha} concurso ${c.concurso} ${c.motivo ? `(${c.motivo})` : ""}`.trim())
    }
  }

  console.log(
    "\nNOTA: CAS solo publica ~Mayo-Sept 2026. No se afirma historial completo desde 2000.",
  )
}

main().catch((e) => {
  console.error("[brinco-backfill] fatal", e)
  process.exit(1)
})
