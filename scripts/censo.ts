import { createClient } from "@supabase/supabase-js"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://wazkylxgqckjfkcmfotl.supabase.co"
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
if (!key) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const sb = createClient(url, key)

;(async () => {
  const turnos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]
  for (const turno of turnos) {
    const { count, error: cout } = await sb
      .from("draws")
      .select("id", { count: "exact", head: true })
      .eq("turno", turno)
      .in("jurisdiccion", ["CABA", "ciudad"])
    if (cout) {
      console.log("=", turno, "count err", cout.message)
      continue
    }
    console.log(`${turno.padEnd(12)} total=${count} (CABA|ciudad)`)
    let minDate: string | null = null
    let maxDate: string | null = null
    const r1 = await sb.from("draws").select("date").eq("turno", turno).in("jurisdiccion", ["CABA", "ciudad"]).order("date", { ascending: true }).limit(1)
    const r2 = await sb.from("draws").select("date").eq("turno", turno).in("jurisdiccion", ["CABA", "ciudad"]).order("date", { ascending: false }).limit(1)
    minDate = (r1.data?.[0] as { date?: string } | undefined)?.date ?? null
    maxDate = (r2.data?.[0] as { date?: string } | undefined)?.date ?? null
    console.log(`${turno.padEnd(12)} total=${count} (CABA|ciudad)  ${minDate} -> ${maxDate}`)
  }
  const { count: bfCount } = await sb.from("poceada_federal_draws").select("concurso", { count: "exact", head: true })
  const bfr1 = await sb.from("poceada_federal_draws").select("fecha").eq("estado", "validated").order("fecha", { ascending: true }).limit(1)
  const bfr2 = await sb.from("poceada_federal_draws").select("fecha").eq("estado", "validated").order("fecha", { ascending: false }).limit(1)
  console.log(`poceada_federal  total=${bfCount}  ${(bfr1.data?.[0] as { fecha?: string } | undefined)?.fecha} -> ${(bfr2.data?.[0] as { fecha?: string } | undefined)?.fecha}`)
  const { count: brCount } = await sb.from("brinco_draws").select("concurso", { count: "exact", head: true })
  console.log(`brinco           total=${brCount}`)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
