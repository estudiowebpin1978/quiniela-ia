/**
 * Brinco OOS — backtest walk-forward honesto contra el azar.
 *
 * Carga los sorteos importados (brinco_draws) y evalúa cronológicamente la
 * jugada del motor contra la línea base hipergeométrica del azar, por separado
 * para Tradicional y Junior. NO promotea ventaja: en un sorteo justo ninguna
 * selección mejora la probabilidad teórica.
 *
 * Run: npx tsx scripts/brinco-oos.ts [--warmup=10]
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

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

import { backtestBrinco, distribucionAzarBrinco, type ResultadoBacktest } from "../lib/brinco/backtest"
import { cargarSorteosBrinco } from "../lib/brinco/store"

function arg(name: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.split("=")[1] : undefined
}

function imprimirModalidad(titulo: string, r: ResultadoBacktest | null): void {
  console.log(`\n── ${titulo} ─────────────────────────────`)
  if (!r) {
    console.log("  Sin datos suficientes para evaluar esta modalidad.")
    return
  }
  console.log(`  Muestras (OOS)     : ${r.muestras} (warmup ${r.warmup})`)
  console.log(`  Media aciertos     : ${r.mediaAciertos.toFixed(3)}`)
  console.log(`  Esperanza azar     : ${r.esperanzaAzar.toFixed(3)}  (desv ${r.desvAzar.toFixed(3)})`)
  console.log(`  z vs azar          : ${r.z.toFixed(2)}  ${r.significativo ? "(SIGNIFICATIVO |z|≥1.96)" : "(sin ventaja demostrada |z|<1.96)"}`)
  console.log(`  Media azar empír.  : ${r.mediaAzarEmpirica.toFixed(3)}`)
  console.log("  Distribución observada (aciertos: frecuencia):")
  r.distribucion.forEach((f, k) => {
    const pct = ((f / r.muestras) * 100).toFixed(1)
    console.log(`    ${k}: ${f}  (${pct}%)`)
  })
  console.log(`  P(≥1)=${r.pAlMenos1.toFixed(3)}  P(≥3)=${r.pAlMenos3.toFixed(3)}  P(≥4)=${r.pAlMenos4.toFixed(3)}  P(≥5)=${r.pAlMenos5.toFixed(3)}  P(=6)=${r.pExactamente6.toFixed(4)}`)
  console.log(`  Limitación: ${r.limitacion}`)
}

async function main() {
  const warmup = arg("warmup") ? parseInt(arg("warmup") as string, 10) : 10
  const sorteos = await cargarSorteosBrinco()
  console.log(`[brinco-oos] ${sorteos.length} sorteos cargados (brinco_draws)`)
  if (sorteos.length === 0) {
    console.log("Sin datos. Corré primero el backfill: npx tsx scripts/brinco-backfill.ts --apply")
    process.exit(0)
  }

  const azar = distribucionAzarBrinco()
  console.log("\nDistribución teórica del AZAR (hipergeométrica, 6 de 40):")
  azar.forEach((p, k) => console.log(`  ${k} aciertos: ${(p * 100).toFixed(2)}%`))

  const report = backtestBrinco(sorteos, warmup)
  console.log(`\n${report.brinco}`)
  console.log(report.advertencia)

  imprimirModalidad("Tradicional", report.tradicional)
  imprimirModalidad("Junior", report.junior)

  console.log(
    "\nCONCLUSIÓN HONESTA: el Brinco es un sorteo justo (1/3.838.380 por combinación). " +
    "Ninguna estrategia supera de forma sostenible la probabilidad teórica. " +
    "El objetivo del motor es el valor esperado (evitar dividir el pozo), no aumentar el azar de acierto.",
  )
}

main().catch((e) => {
  console.error("[brinco-oos] fatal", e)
  process.exit(1)
})
