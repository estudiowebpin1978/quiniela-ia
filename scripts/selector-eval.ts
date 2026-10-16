/**
 * Corrida walk-forward del meta-selector (`lib/selector`) sobre datos oficiales.
 *
 * SÓLO LECTURA: consulta `draws` (columna Ciudad, game_id Nacional) y las RPCs
 * de evaluación `calculate_omega_v6` / `score_numbers_v6` con `p_date` = fecha
 * del corte (anti-fuga nativa: esas RPCs filtran `date < p_date`).
 *
 * Candidatos 2 cifras: frecuencia, recencia, bayes (puros) + OMEGA V7/V7-ens
 * (motor existente con `asOf`) + combo + OMEGA V6 (inyectado por RPC).
 * EXCLUIDOS con advertencia (no reproducibles sin fuga temporal):
 *  - ML (ml_models): los modelos entrenados no tienen fecha de entrenamiento
 *    reproducible por corte → su score podría usar información posterior.
 *  - V7/ML sobre candidatos 3/4 cifras (`predictV7ForCandidates` y
 *    `getMLPredictionsForCandidates`): usan stats precomputados / modelos sin
 *    corte temporal.
 *
 * Uso:
 *   npx tsx scripts/selector-eval.ts [--turnos=Primera,Matutina] [--warmup=60]
 *        [--step=3] [--sin-v6] [--cifras-paso=3] [--salida=<ruta.json>]
 */

import { config as cargarEnv } from "dotenv"

cargarEnv({ path: ".env.local" })
cargarEnv()

import type { CandidatoSelector, SorteoSelector } from "../lib/selector/tipos"
import type { ResultadoSelector } from "../lib/selector/walkforward"

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
function arg(name: string, def: string): string {
  const f = args.find((a) => a.startsWith(`--${name}=`))
  return f ? f.split("=").slice(1).join("=") : def
}
const TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna"]
const turnosSel = arg("turnos", TURNOS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
const warmup = parseInt(arg("warmup", "60"), 10)
const step = parseInt(arg("step", "3"), 10)
const sinV6 = args.includes("--sin-v6")
const cifrasPaso = parseInt(arg("cifras-paso", "3"), 10) // 0 = no evaluar 3/4C
const salida = arg(
  "salida",
  `${process.env.TEMP ?? process.env.TMP ?? "."}\\selector-eval.json`
)

// ─── Tipos locales ───────────────────────────────────────────────────────────

interface ResumenCifras {
  cifras: 3 | 4
  cortes: number
  /** Tasa de sorteos con ≥1 acierto entre los 20 puestos (top-10 del modelo). */
  tasas: Record<string, number>
  /** Azar DENTRO del universo V6 (K=5 muestreos sembrados). */
  refUniverso: number
  /** Azar uniforme sobre TODO el espacio (analítico): 1 − ∏(N−20−i)/(N−i). */
  refEspacio: number
  metaVsRefUniverso: { promedio: number; intervalo95: [number, number]; p: number; n: number }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { createClient } = await import("@supabase/supabase-js")
  const sel = await import("../lib/selector/walkforward")
  const tipos = await import("../lib/selector/tipos")
  const evaluarMod = await import("../lib/selector/evaluar")
  const candMod = await import("../lib/selector/candidatos")
  const pfBacktest = await import("../lib/poceada-federal/backtest")
  const { mapearCandidatosV6 } = await import("../lib/pipeline/precompute/blend")

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno (.env.local).")
    process.exit(1)
  }
  const supabase = createClient(url, key)

  console.log("=== META-SELECTOR — corrida real (sólo lectura) ===")
  console.log(`Turnos: ${turnosSel.join(", ")} | warmup=${warmup} | step=${step} | v6=${sinV6 ? "NO" : "sí"} | cifras-paso=${cifrasPaso}`)

  // 1) Sorteos oficiales (paginado; el tope PostgREST es 1000 filas).
  const porTurno = await cargarSorteos(supabase, turnosSel)
  for (const t of turnosSel) {
    const arr = porTurno.get(t) ?? []
    console.log(`  ${t}: ${arr.length} sorteos (${arr[0]?.fecha ?? "?"} → ${arr[arr.length - 1]?.fecha ?? "?"})`)
  }

  const advertenciasGlobales = [
    "ML excluido: los modelos de ml_models no tienen fecha de entrenamiento reproducible por corte (posible fuga).",
    "V7/ML sobre candidatos 3/4 cifras excluidos: predictV7ForCandidates usa stats precomputados sin corte temporal (fuga).",
  ]

  // 2) Candidatos 2 cifras.
  const candidatos: CandidatoSelector[] = [...candMod.candidatosBase()]
  if (!sinV6) candidatos.push(candidatoV6(supabase, pfBacktest.mulberry32))

  // 3) Walk-forward por turno.
  const resultados = new Map<string, ResultadoSelector>()
  const cifras = new Map<string, ResumenCifras[]>()
  for (const turno of turnosSel) {
    const sorteos = porTurno.get(turno) ?? []
    if (sorteos.length < warmup + 20) {
      console.log(`\n── ${turno}: SALTADO (historial ${sorteos.length} < warmup+20) ──`)
      continue
    }
    console.log(`\n── Turno ${turno} ──`)
    const r = await sel.walkForwardSelector(sorteos, candidatos, {
      turno,
      warmup,
      step,
      minValid: 30,
      permutaciones: 2000,
      conjuntosReferencia: 5,
    })
    resultados.set(turno, r)
    imprimirResumen2C(r)

    // 4) 3/4 cifras sobre submuestreo de cortes (universo V6 con p_date).
    if (cifrasPaso > 0 && !sinV6) {
      const resCifras = await evaluarCifrasPorTurno(supabase, sorteos, turno, warmup, step, cifrasPaso, r, {
        mapearCandidatosV6,
        aciertoEn20Puestos: evaluarMod.aciertoEn20Puestos,
        puntuarCandidatoPuro: evaluarMod.puntuarCandidatoPuro,
        blendGenerico: evaluarMod.blendGenerico,
        mulberry32: pfBacktest.mulberry32,
        permutacionPareada: pfBacktest.permutacionPareada,
      })
      cifras.set(turno, resCifras)
      for (const rc of resCifras) imprimirResumenCifras(rc)
    }
  }

  // 5) Veredicto global honesto.
  console.log("\n=== VEREDICTO ===")
  const demostradas = [...resultados.values()].filter((r) => r.diferencia.metaVsAzar.ventajaDemostrada)
  console.log(
    `Meta con ventaja demostrada (3 condiciones) en ${demostradas.length}/${resultados.size} turnos: ${
      demostradas.length ? demostradas.map((r) => r.turno).join(", ") : "ninguno"
    }`
  )
  console.log(
    "Recordatorio: evaluación reconstruida retrospectiva; una ventaja aquí requiere confirmación con predicciones registradas pre-sorteo."
  )

  // 6) Persistir artefacto local (NO se commitea).
  const fs = await import("node:fs")
  const artefacto = {
    generadoEn: new Date().toISOString(),
    config: { turnosSel, warmup, step, sinV6, cifrasPaso, version: tipos.VERSION_SELECTOR },
    advertenciasGlobales,
    resultados: Object.fromEntries(resultados),
    cifras: Object.fromEntries(cifras),
  }
  fs.writeFileSync(salida, JSON.stringify(artefacto, null, 2), "utf8")
  console.log(`\nArtefacto guardado en ${salida}`)
}

// ─── Datos ───────────────────────────────────────────────────────────────────

async function cargarSorteos(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  turnos: string[]
): Promise<Map<string, SorteoSelector[]>> {
  const filas: Array<{ date: string; turno: string; numbers: number[] }> = []
  let desde = 0
  for (;;) {
    const { data, error } = await supabase
      .from("draws")
      .select("date,turno,numbers")
      .order("date", { ascending: true })
      .range(desde, desde + 999)
    if (error) throw new Error(`draws: ${error.message}`)
    filas.push(...((data ?? []) as Array<{ date: string; turno: string; numbers: number[] }>))
    if (!data || data.length < 1000) break
    desde += 1000
  }
  const porTurno = new Map<string, SorteoSelector[]>()
  for (const t of turnos) porTurno.set(t, [])
  for (const f of filas) {
    const arr = porTurno.get(f.turno)
    if (!arr) continue // sólo columna Ciudad / turnos Quiniela (sin Poceada)
    arr.push({ fecha: f.date, turno: f.turno, numbers: f.numbers as number[] })
  }
  for (const arr of porTurno.values()) arr.sort((a, b) => a.fecha.localeCompare(b.fecha))
  return porTurno
}

// ─── Candidato V6 inyectado (RPC anti-fuga) ──────────────────────────────────

function candidatoV6(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  _mulberry32: (n: number) => () => number
): CandidatoSelector {
  let errores = 0
  return {
    nombre: "v6",
    fuente: "inyectado",
    evaluar: async (ctx) => {
      // La RPC filtra date < p_date → el corte estricto lo garantiza SQL.
      const { data, error } = await supabase.rpc("calculate_omega_v6", {
        p_turno: ctx.turno,
        p_tier: "free",
        p_date: ctx.asOf,
      })
      if (error || !data) {
        errores++
        if (errores > 5) throw new Error(`V6 RPC falló ${errores} veces (${JSON.stringify(error)})`)
        // Neutral transitorio (sube el "error" y se reporta; no silencia).
        return Array.from({ length: 100 }, (_, i) => i)
      }
      const top = (data as Array<{ numero: number }>).map((r) => Number(r.numero))
      const vistos = new Set(top)
      const resto = Array.from({ length: 100 }, (_, i) => i).filter((n) => !vistos.has(n))
      return [...top, ...resto]
    },
  }
}

// ─── Impresión ───────────────────────────────────────────────────────────────

function imprimirResumen2C(r: ResultadoSelector): void {
  const m = r.muestra
  console.log(
    `  Cortes ${m.cortes} | train ${m.train.cortes} (${m.train.desde}→${m.train.hasta}) | valid ${m.valid.cortes} | holdout ${m.holdout.cortes}`
  )
  const pesos = Object.entries(r.pesos.pesos)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v.toFixed(3)}`)
    .join(", ")
  console.log(
    `  Pesos[${r.pesos.metodo}, nValid=${r.pesos.nValid}${r.pesos.experimental ? ", EXPERIMENTAL" : ""}]: ${pesos}`
  )
  const d = r.diferencia.metaVsAzar
  const f = (x: number) => x.toFixed(4)
  console.log(
    `  Meta vs azar(K=5): ${f(d.promedio)} IC95 [${f(d.intervalo95[0])}, ${f(d.intervalo95[1])}] p=${f(d.pPermutacion)} | ventaja=${d.ventajaDemostrada ? "SÍ" : "NO"} (ic=${d.condiciones.ic95} perm=${d.condiciones.permutacion} hold=${d.condiciones.holdout})`
  )
  if (d.holdout) {
    console.log(
      `  Holdout(${d.holdout.evaluaciones}): ${f(d.holdout.diferencia)} IC [${f(d.holdout.intervalo95[0])}, ${f(d.holdout.intervalo95[1])}]${d.holdout.contradice ? " CONTRADICE" : ""}`
    )
  }
  const bloques = d.bloques.map((b) => `${b.indice}:${f(b.promedio)}`).join(" ")
  console.log(`  Bloques: ${bloques}`)
  if (r.diferencia.metaVsMejorCandidato) {
    const mv = r.diferencia.metaVsMejorCandidato
    console.log(
      `  Meta vs mejor(${mv.mejor}, elegido en valid) en holdout: ${f(mv.holdout.promedio)} IC [${f(mv.holdout.intervalo95[0])}, ${f(mv.holdout.intervalo95[1])}] p=${f(mv.holdout.pPermutacion)}`
    )
  }
  const hold = Object.entries(r.metricas.holdout.candidatos)
    .map(([nm, m2]) => `${nm}: cabeza@10 ${m2.cabezaEnTopK.toFixed(3)} hits2C ${m2.mediaHits2C.toFixed(2)}`)
    .join(" | ")
  console.log(`  Métricas holdout → meta: cabeza@10 ${r.metricas.holdout.meta.cabezaEnTopK.toFixed(3)} hits2C ${r.metricas.holdout.meta.mediaHits2C.toFixed(2)}`)
  console.log(`  ${hold}`)
  const dup = r.duplicacion.filter((x) => x.solapeTopK >= 0.5)
  if (dup.length) {
    console.log(
      `  Duplicación (solape≥0.5): ${dup.map((x) => `${x.a}~${x.b} ${x.solapeTopK}(ρ=${x.spearman})`).join(", ")}`
    )
  }
}

function imprimirResumenCifras(rc: ResumenCifras): void {
  const f = (x: number) => x.toFixed(4)
  const tasas = Object.entries(rc.tasas)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${f(v)}`)
    .join(" | ")
  console.log(
    `  ${rc.cifras}C (${rc.cortes} cortes): ${tasas} | ref-universo ${f(rc.refUniverso)} | ref-espacio ${f(rc.refEspacio)}`
  )
  console.log(
    `    meta vs azar-universo: ${f(rc.metaVsRefUniverso.promedio)} IC [${f(rc.metaVsRefUniverso.intervalo95[0])}, ${f(rc.metaVsRefUniverso.intervalo95[1])}] p=${f(rc.metaVsRefUniverso.p)}`
  )
}

// ─── Evaluación 3/4 cifras (universo V6 con p_date) ──────────────────────────

async function evaluarCifrasPorTurno(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  sorteos: SorteoSelector[],
  turno: string,
  warmupLoc: number,
  stepLoc: number,
  cifrasPasoLoc: number,
  resultado2C: ResultadoSelector,
  helpers: {
    mapearCandidatosV6: (rows: Array<Record<string, unknown>> | null | undefined, limit?: number) => Array<{ numero: number; v6Score: number }>
    aciertoEn20Puestos: (picks: number[], sorteo: SorteoSelector, cifras: 3 | 4) => boolean
    puntuarCandidatoPuro: (candidato: number, historial: SorteoSelector[], cifras: 2 | 3 | 4, modo: "frecuencia" | "recencia" | "bayes", halfLife?: number) => number
    blendGenerico: (candidatos: number[], porMotor: Record<string, (c: number) => number>, pesos: Record<string, number>) => number[]
    mulberry32: (n: number) => () => number
    permutacionPareada: (difs: number[], iteraciones: number, semilla: number) => number
  }
): Promise<ResumenCifras[]> {
  // Pesos del meta-selector (2C, validación interna) restringidos a los
  // motores evaluables en 3/4C (V6 + baselines puros) y renormalizados.
  const nombresCifras = ["v6", "frecuencia", "recencia", "bayes"]
  const pesosBase: Record<string, number> = {}
  for (const nm of nombresCifras) pesosBase[nm] = resultado2C.pesos.pesos[nm] ?? 0
  const sumaPesos = Object.values(pesosBase).reduce((a, b) => a + b, 0)
  const pesos =
    sumaPesos > 0
      ? Object.fromEntries(nombresCifras.map((nm) => [nm, pesosBase[nm] / sumaPesos]))
      : Object.fromEntries(nombresCifras.map((nm) => [nm, 1 / nombresCifras.length]))

  const cortes: number[] = []
  for (let t = warmupLoc; t < sorteos.length; t += stepLoc * cifrasPasoLoc) cortes.push(t)

  const salida: ResumenCifras[] = []
  for (const cifras of [3, 4] as const) {
    const N = cifras === 3 ? 1000 : 10000
    const aciertos: Record<string, number[]> = {
      v6: [], frecuencia: [], recencia: [], bayes: [], meta: [],
    }
    const refUniverso: number[] = []
    const difs: number[] = []
    let usados = 0

    for (const t of cortes) {
      const sorteo = sorteos[t]
      const hist = sorteos.slice(0, t)
      const rows = await rpcScoreCifras(supabase, turno, sorteo.fecha, cifras)
      const universo = helpers.mapearCandidatosV6(rows, 30)
      if (universo.length < 10) continue
      const candidatosU = universo.map((c) => c.numero)
      const v6Map = new Map(universo.map((c) => [c.numero, c.v6Score]))
      const porMotor: Record<string, (c: number) => number> = {
        v6: (c) => v6Map.get(c) ?? 0,
        frecuencia: (c) => helpers.puntuarCandidatoPuro(c, hist, cifras, "frecuencia"),
        recencia: (c) => helpers.puntuarCandidatoPuro(c, hist, cifras, "recencia"),
        bayes: (c) => helpers.puntuarCandidatoPuro(c, hist, cifras, "bayes"),
      }
      const picks: Record<string, number[]> = {
        v6: [...candidatosU].sort((a, b) => (v6Map.get(b) ?? 0) - (v6Map.get(a) ?? 0)).slice(0, 10),
        frecuencia: ordenarPor(candidatosU, porMotor.frecuencia).slice(0, 10),
        recencia: ordenarPor(candidatosU, porMotor.recencia).slice(0, 10),
        bayes: ordenarPor(candidatosU, porMotor.bayes).slice(0, 10),
        meta: helpers.blendGenerico(candidatosU, porMotor, pesos).slice(0, 10),
      }
      for (const nm of Object.keys(picks)) {
        aciertos[nm].push(helpers.aciertoEn20Puestos(picks[nm], sorteo, cifras) ? 1 : 0)
      }
      // Referencia aleatoria DENTRO del universo (K=5 sembrados).
      let hitsRef = 0
      for (let k = 0; k < 5; k++) {
        const rnd = helpers.mulberry32((0xc1f5 + k * 7919 + t * 104729 + cifras) >>> 0)
        const pool = [...candidatosU]
        for (let i = pool.length - 1; i > 0; i--) {
          const j = Math.floor(rnd() * (i + 1))
          ;[pool[i], pool[j]] = [pool[j], pool[i]]
        }
        hitsRef += helpers.aciertoEn20Puestos(pool.slice(0, 10), sorteo, cifras) ? 1 : 0
      }
      const refProm = hitsRef / 5
      refUniverso.push(refProm)
      difs.push((aciertos.meta[aciertos.meta.length - 1] ?? 0) - refProm)
      usados++
    }

    if (usados === 0) continue
    const tasa = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length
    const media = difs.reduce((a, b) => a + b, 0) / difs.length
    const varianza = difs.length > 1 ? difs.reduce((a, b) => a + (b - media) ** 2, 0) / (difs.length - 1) : 0
    const ee = Math.sqrt(varianza / difs.length)
    let refEspacio = 1
    for (let i = 0; i < 10; i++) refEspacio *= (N - 20 - i) / (N - i)
    refEspacio = 1 - refEspacio

    salida.push({
      cifras,
      cortes: usados,
      tasas: Object.fromEntries(Object.entries(aciertos).map(([nm, arr]) => [nm, tasa(arr)])),
      refUniverso: tasa(refUniverso),
      refEspacio,
      metaVsRefUniverso: {
        promedio: media,
        intervalo95: [media - 1.96 * ee, media + 1.96 * ee],
        p: helpers.permutacionPareada(difs, 1000, (0x51ed + cifras) >>> 0),
        n: difs.length,
      },
    })
  }
  return salida
}

function ordenarPor(candidatos: number[], score: (c: number) => number): number[] {
  return [...candidatos].sort((a, b) => score(b) - score(a) || a - b)
}

async function rpcScoreCifras(
  supabase: import("@supabase/supabase-js").SupabaseClient,
  turno: string,
  fecha: string,
  cifras: 3 | 4
): Promise<Array<Record<string, unknown>> | null> {
  const params = {
    p_turno: turno,
    p_date: fecha,
    p_digit_space: String(cifras),
    p_modulus: cifras === 3 ? 1000 : 10000,
    p_series_start: 0,
    p_series_end: cifras === 3 ? 999 : 9999,
  }
  let ultimo: unknown = null
  for (let intento = 0; intento < 2; intento++) {
    const { data, error } = await supabase.rpc("score_numbers_v6" as never, params as never)
    if (!error) return data as Array<Record<string, unknown>> | null
    ultimo = error
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`score_numbers_v6(${cifras}C, ${turno}, ${fecha}): ${JSON.stringify(ultimo)}`)
}

main().catch((e) => {
  console.error("FALLO:", e instanceof Error ? e.message : e)
  process.exit(1)
})
