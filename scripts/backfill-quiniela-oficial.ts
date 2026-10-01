/**
 * Repara draws de Quiniela corruptos (filas de numerosenvivo.com.ar con números
 * repetidos consecutivos) usando la fuente oficial LOTBA:
 *   https://quiniela.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=N
 *
 * Cada sorteo = un turno de un día: {sorteo, fecha: "DD/MM/YYYY", modalidad, numeros_juegos.Tradicional}
 * Uso: $env:SUPABASE_SERVICE_ROLE_KEY=...; npx tsx scripts/backfill-quiniela-oficial.ts [--apply]
 * Sin --apply hace dry-run (solo reporta diferencias).
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js"

const TURNOS: Record<string, string> = {
  PRE: "Previa",
  PRIM: "Primera",
  MATU: "Matutina",
  VESP: "Vespertina",
  NOCT: "Nocturna",
}

function mapModalidad(mod: string): string | null {
  const m = mod.trim().toUpperCase()
  for (const key of Object.keys(TURNOS)) {
    if (m === key || m.startsWith(key)) return TURNOS[key]
  }
  return null
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"

type OficialDraw = { sorteo: number; fechaISO: string; turno: string; numbers: number[] }

async function fetchSorteo(sorteo: number): Promise<OficialDraw | null> {
  const url = `https://quiniela.loteriadelaciudad.gob.ar/includes/resultados-data.php?sorteo=${sorteo}`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(20000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      const m = text.match(/window\.RESULTADOS_DATA\s*=\s*(\[.*?\]);/s)
      if (!m) return null
      const arr = JSON.parse(m[1]) as any[]
      if (!Array.isArray(arr) || arr.length === 0) return null
      const item = arr[0]
      const turno = mapModalidad(String(item.modalidad || ""))
      if (!turno) return null
      const nums: string[] =
        item.numeros_juegos?.Tradicional ??
        item.jurisdicciones?.["51"]?.numeros?.map((n: any) => n.val) ??
        []
      if (!Array.isArray(nums) || nums.length !== 20) return null
      const dm = String(item.fecha).match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
      if (!dm) return null
      const fechaISO = `${dm[3]}-${dm[2]}-${dm[1]}`
      return { sorteo: item.sorteo ?? sorteo, fechaISO, turno, numbers: nums.map((n) => parseInt(n, 10)) }
    } catch {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)))
    }
  }
  return null
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  let i = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out.push(await fn(items[idx]))
    }
  })
  await Promise.all(workers)
  return out
}

function fechaToNum(fechaISO: string): number {
  return parseInt(fechaISO.replace(/-/g, ""), 10)
}

async function findBound(targetISO: string, lo: number, hi: number, pick: "first" | "last"): Promise<number> {
  const target = fechaToNum(targetISO)
  let ans = pick === "first" ? hi : lo
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const d = await fetchSorteo(mid)
    if (!d) {
      // sin dato: asumir que sigue hacia el lado buscado
      if (pick === "first") lo = mid + 1
      else hi = mid - 1
      continue
    }
    const f = fechaToNum(d.fechaISO)
    if (pick === "first") {
      if (f >= target) { ans = mid; hi = mid - 1 } else lo = mid + 1
    } else {
      if (f <= target) { ans = mid; lo = mid + 1 } else hi = mid - 1
    }
  }
  return ans
}

function keyOf(fechaISO: string, turno: string): string {
  return `${fechaISO}|${turno}`
}

function sameNumbers(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort((x, y) => x - y)
  const sb = [...b].sort((x, y) => x - y)
  return sa.every((v, i) => v === sb[i])
}

async function main() {
  const apply = process.argv.includes("--apply")
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY")
  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey)

  const FROM = process.env.BACKFILL_FROM || "2025-09-01"
  const TO = process.env.BACKFILL_TO || "2026-03-01"

  console.log(`[1/4] Buscando límites de sorteo para ${FROM}..${TO}`)
  const lo = await findBound(FROM, 50000, 53000, "first")
  const hi = await findBound(TO, 50000, 53000, "last")
  console.log(`  sorteos ${lo}..${hi} (${hi - lo + 1} requests)`)

  console.log(`[2/4] Descargando sorteos oficiales (concurrencia 8)`)
  const sorteos: number[] = []
  for (let n = lo; n <= hi; n++) sorteos.push(n)
  const results = await pool(sorteos, 8, fetchSorteo)
  const oficial = new Map<string, OficialDraw>()
  let emptyCount = 0
  for (const r of results) {
    if (!r) { emptyCount++; continue }
    oficial.set(keyOf(r.fechaISO, r.turno), r)
  }
  const modals = new Set<string>()
  console.log(`  descargados=${results.filter(Boolean).length} vacíos/inválidos=${emptyCount} claves=${oficial.size}`)
  void modals

  console.log(`[3/4] Comparando con filas de DB (source=numerosenvivo, quiniela)`)
  const dbRows: any[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data: page, error: pageErr } = await supabase
      .from("draws")
      .select("id,date,turno,numbers,source")
      .in("turno", Object.values(TURNOS))
      .gte("date", FROM)
      .lte("date", TO)
      .order("date", { ascending: true })
      .order("turno", { ascending: true })
      .range(from, from + PAGE - 1)
    if (pageErr) throw pageErr
    dbRows.push(...(page || []))
    if (!page || page.length < PAGE) break
  }
  const nvRows = dbRows.filter((r) => (r.source || "").includes("numerosenvivo"))
  const otherRows = dbRows.filter((r) => !(r.source || "").includes("numerosenvivo"))
  console.log(`  filas en rango=${dbRows.length} (numerosenvivo=${nvRows.length}, otras=${otherRows.length})`)

  let updated = 0, alreadyOk = 0, noOfficial = 0
  let otherMismatch = 0
  let inserted = 0
  const pending: { id: string; numbers: number[] }[] = []

  for (const r of nvRows) {
    const off = oficial.get(keyOf(r.date, r.turno))
    if (!off) {
      noOfficial++
      console.log(`  [SIN OFICIAL] ${r.date} ${r.turno} src=${r.source} nums=${[...r.numbers].sort((a, b) => a - b).join(",")}`)
      continue
    }
    if (sameNumbers(r.numbers, off.numbers)) { alreadyOk++; continue }
    pending.push({ id: r.id, numbers: off.numbers })
  }
  const dbKeys = new Set(dbRows.map((r) => keyOf(r.date, r.turno)))
  const missing: string[] = []
  for (const k of oficial.keys()) if (!dbKeys.has(k)) missing.push(k)

  const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString().slice(0, 10)
  const phantomRows = dbRows.filter((r) => !oficial.has(keyOf(r.date, r.turno)) && r.date <= cutoff)
  const unpublishedRecent = dbRows.filter((r) => !oficial.has(keyOf(r.date, r.turno)) && r.date > cutoff)

  for (const r of otherRows) {
    const off = oficial.get(keyOf(r.date, r.turno))
    if (off && !sameNumbers(r.numbers, off.numbers)) {
      otherMismatch++
      console.log(`  [difiere otras] ${r.date} ${r.turno} src=${r.source}`)
      console.log(`     db:     ${[...r.numbers].sort((a, b) => a - b).join(",")}`)
      console.log(`     oficial:${[...off.numbers].sort((a, b) => a - b).join(",")}`)
      pending.push({ id: r.id, numbers: off.numbers })
    }
  }

  console.log(`  numerosenvivo a reparar=${pending.length - otherMismatch} ya ok=${alreadyOk} sin oficial=${noOfficial}`)
  console.log(`  otras fuentes a reparar=${otherMismatch}`)
  console.log(`  sorteos oficiales sin fila en DB (a insertar)=${missing.length}`)
  for (const k of missing.slice(0, 20)) console.log(`     falta: ${k}`)
  console.log(`  filas DB sin sorteo oficial (fantasma, a borrar)=${phantomRows.length}`)
  for (const r of phantomRows) console.log(`     fantasma: ${r.date} ${r.turno} src=${r.source}`)
  if (unpublishedRecent.length > 0) {
    console.log(`  filas recientes sin oficial aún (no tocar, publicación pendiente)=${unpublishedRecent.length}`)
    for (const r of unpublishedRecent) console.log(`     pendiente: ${r.date} ${r.turno} src=${r.source}`)
  }

  const QUINIELA_GAME_ID = "ac593199-c299-4f03-b1b7-8675fe4fa6d9"
  if (apply) {
    console.log(`[4/4] Aplicando: updates=${pending.length} inserts=${missing.length} deletes=${phantomRows.length}`)
    if (pending.length > 0) {
      await pool(pending, 4, async (p) => {
        const { error: updErr } = await supabase
          .from("draws")
          .update({ numbers: p.numbers, source: "loteriadelaciudad.gob.ar (oficial)" })
          .eq("id", p.id)
        if (updErr) console.error(`  ERR upd id=${p.id}: ${updErr.message}`)
        else updated++
        return null
      })
      console.log(`  updates aplicados=${updated}/${pending.length}`)
    }
    for (const r of phantomRows) {
      console.log(`  DEL ${r.date} ${r.turno} src=${r.source} nums=${JSON.stringify(r.numbers)}`)
      const { error: delErr } = await supabase.from("draws").delete().eq("id", r.id)
      if (delErr) console.error(`  ERR del ${r.date} ${r.turno}: ${delErr.message}`)
      else console.log(`  DEL ok`)
    }
    if (missing.length > 0) {
      await pool(missing, 4, async (k) => {
        const [fechaISO, turno] = k.split("|")
        const off = oficial.get(k)!
        const { error: insErr } = await supabase.rpc("upsert_draw" as never, {
          p_date: fechaISO,
          p_turno: turno,
          p_numbers: off.numbers,
          p_source: "lotba-oficial",
          p_game_id: QUINIELA_GAME_ID,
          p_jurisdiccion: "CABA",
        } as never)
        if (insErr) console.error(`  ERR ins ${k}: ${insErr.message}`)
        else inserted++
        return null
      })
      console.log(`  inserts aplicados=${inserted}/${missing.length}`)
    }
  } else {
    console.log(`[4/4] DRY-RUN (sin --apply). Pasar --apply para escribir cambios.`)
  }

  console.log("DONE")
}

main().catch((e) => { console.error(e); process.exit(1) })
