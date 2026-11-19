/**
 * Backfill de factor_weight_history (sección "Rendimiento por Factor")
 *
 * Recorre los últimos N días y evalúa la efectividad de los factores V6
 * de cada turno contra su sorteo oficial. Idempotente: reemplaza las
 * filas existentes de cada (turno, fecha).
 *
 * Uso: npx tsx scripts/backfill-factor-history.ts [--dias=15]
 */

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { evaluateV6Factors } from "../lib/analisis/factor-evaluation"

// Cargar .env.local si las variables no vienen del entorno (debe ir
// antes de las llamadas: la config se lee perezosamente en cada función)
try {
  const txt = readFileSync(join(process.cwd(), ".env.local"), "utf8")
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "")
    }
  }
} catch { /* sin .env.local: se usan las variables de entorno */ }

const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]

const argDias = process.argv.find((a) => a.startsWith("--dias="))
const DIAS = argDias ? Math.max(1, parseInt(argDias.split("=")[1], 10) || 15) : 15

function fechaHace(diasAtras: number): string {
  const d = new Date()
  d.setDate(d.getDate() - diasAtras)
  return d.toLocaleDateString("sv-SE", { timeZone: "America/Argentina/Buenos_Aires" })
}

async function main(): Promise<void> {
  let guardadas = 0
  let omitidas = 0

  for (let i = DIAS - 1; i >= 0; i--) {
    const fecha = fechaHace(i)
    for (const turno of TURNOS) {
      const res = await evaluateV6Factors(turno, fecha)
      if (res) {
        guardadas++
        console.log(
          `+ ${fecha} ${turno.padEnd(10)} hit=${String(Math.round(res.hitRate * 100)).padStart(3)}% ` +
          `samples=${res.samples} factores=${Object.keys(res.factorAccuracies).length}`,
        )
      } else {
        omitidas++
      }
    }
  }

  console.log("")
  console.log(`Backfill completo: ${guardadas} evaluaciones guardadas, ${omitidas} omitidas (sin sorteo/predicción/atribución).`)

  const { getSupabaseAdmin } = await import("../lib/supabase-client")
  const supabase = getSupabaseAdmin()
  const { count } = await supabase
    .from("factor_weight_history")
    .select("*", { count: "exact", head: true })
  console.log(`factor_weight_history total: ${count ?? "?"} filas`)
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e)
  process.exit(1)
})
