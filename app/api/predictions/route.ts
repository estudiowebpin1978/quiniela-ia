import { NextRequest, NextResponse } from "next/server"

const SUENOS: { [k: number]: string } = {
  0: "Huevos", 1: "Agua", 2: "Nino", 3: "San Cono", 4: "La cama", 5: "Gato", 6: "Perro", 7: "Revolver", 8: "Incendio", 9: "Arroyo",
  10: "La leche", 11: "Minero", 12: "Soldado", 13: "La yeta", 14: "Borracho", 15: "Nina bonita", 16: "Anillo", 17: "Desgracia", 18: "Sangre", 19: "Pescado",
  20: "La fiesta", 21: "Mujer", 22: "Loco", 23: "Cocinero", 24: "Caballo", 25: "Gallina", 26: "La misa", 27: "Peine", 28: "Cerro", 29: "San Pedro",
  30: "Santa Rosa", 31: "Luz", 32: "Dinero", 33: "Cristo", 34: "Cabeza", 35: "Pajarito", 36: "Manteca", 37: "Dentista", 38: "Piedras", 39: "Lluvia",
  40: "Cura", 41: "Cuchillo", 42: "Zapatillas", 43: "Balcon", 44: "Carcel", 45: "Vino", 46: "Tomates", 47: "Muerto", 48: "Muerto habla", 49: "Carne",
  50: "Pan", 51: "Serrucho", 52: "Madre", 53: "Barco", 54: "Vaca", 55: "Musica", 56: "Caida", 57: "Jorobado", 58: "Ahogado", 59: "Plantas",
  60: "Virgen", 61: "Escopeta", 62: "Inundacion", 63: "Casamiento", 64: "Llanto", 65: "Cazador", 66: "Lombrices", 67: "Vibora", 68: "Sobrinos", 69: "Vicios",
  70: "Muerto sueno", 71: "Excremento", 72: "Sorpresa", 73: "Hospital", 74: "Gente negra", 75: "Besos", 76: "Fuego", 77: "Pierna mujer", 78: "Ramera", 79: "Ladron",
  80: "Bochas", 81: "Flores", 82: "Pelea", 83: "Mal tiempo", 84: "Iglesia", 85: "Linterna", 86: "Humo", 87: "Piojos", 88: "Papas", 89: "Rata", 90: "Miedo",
  91: "Excursion", 92: "Medico", 93: "Enamorado", 94: "Cementerio", 95: "Anteojos", 96: "Marido", 97: "Mesa", 98: "Lavandera", 99: "Hermano",
}

function pad(n: number, l = 2) {
  return String(n).padStart(l, "0")
}


// Sesgos por defecto - se actualizan automaticamente cada mes
const SESGOS_DEFAULT: Record<string, number[]> = {
  "Previa":     [95,45,15,99],
  "Primera":    [38,73,97,37,50,72,19],
  "Matutina":   [14,24,26,74,92,20],
  "Vespertina": [27,14,43,92,68,69],
  "Nocturna":   [26,35,76,45,88]
}
async function getSesgos(sb:string, sk:string): Promise<Record<string,number[]>> {
  try {
    const r = await fetch(`${sb}/rest/v1/config?key=eq.sesgos&select=value&limit=1`,{
      headers:{"apikey":sk,"Authorization":`Bearer ${sk}`},
      signal:AbortSignal.timeout(3000)
    })
    if(!r.ok) return SESGOS_DEFAULT
    const data = await r.json()
    if(!data?.[0]?.value) return SESGOS_DEFAULT
    return JSON.parse(data[0].value)
  } catch { return SESGOS_DEFAULT }
}
function monteCarlo(freq: number[]): number[] {
  const mc = new Array(freq.length).fill(0)
  const w = freq.map((f) => f + 1)
  const tot = w.reduce((a, b) => a + b, 0)
  const cum: number[] = []
  let acc = 0
  for (const x of w) {
    acc += x / tot
    cum.push(acc)
  }
  const samples = Math.min(20000, 5000 + freq.length * 20)
  for (let s = 0; s < samples; s++) {
    const r = Math.random()
    let lo = 0,
      hi = freq.length - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      if (cum[m] < r) lo = m + 1
      else hi = m
    }
    mc[lo]++
  }
  return mc
}

type Row = { numbers?: unknown[]; date?: string; turno?: string }

function buildCooccurrence(rows: Row[]): number[][] {
  const co = Array.from({ length: 100 }, () => new Array(100).fill(0))
  for (const row of rows) {
    const nums = Array.isArray(row.numbers) ? row.numbers : []
    const set = new Set<number>()
    const list: number[] = []
    for (const n of nums) {
      const t = Number(n) % 100
      if (t >= 0 && t <= 99 && !set.has(t)) {
        set.add(t)
        list.push(t)
      }
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = Math.min(list[i], list[j])
        const b = Math.max(list[i], list[j])
        co[a][b]++
      }
    }
  }
  return co
}

/** Par óptimo: maximiza score_i * score_j * (1 + log(1 + coocurrencias históricas del par)). */
function bestRedoblonaPair(
  scores: { n: number; score: number }[],
  co: number[][],
  take = 18
): { a: number; b: number; label: string } {
  const top = scores.slice(0, take).map((s) => s.n)
  if (top.length < 2) {
    const a = top[0] ?? 0
    const b = top[1] ?? (a === 0 ? 1 : 0)
    return { a, b, label: `${pad(a)}-${pad(b)}` }
  }
  let best = { a: top[0], b: top[1], w: -1 }
  const scMap = new Map(scores.map((s) => [s.n, s.score]))
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const a = Math.min(top[i], top[j])
      const b = Math.max(top[i], top[j])
      const si = scMap.get(a) ?? 0
      const sj = scMap.get(b) ?? 0
      const c = co[a][b] ?? 0
      const w = si * sj * (1 + Math.log1p(c))
      if (w > best.w) best = { a, b, w }
    }
  }
  return { a: best.a, b: best.b, label: `${pad(best.a)}-${pad(best.b)}` }
}

function scoreDigits(freq: number[], histOrder: number[], recentWindow: number) {
  const len = freq.length
  const delay = new Array(len).fill(histOrder.length)
  for (let i = histOrder.length - 1; i >= 0; i--) {
    const v = histOrder[i]
    if (v >= 0 && v < len && delay[v] === histOrder.length) delay[v] = histOrder.length - 1 - i
  }
  const trend = new Array(len).fill(0)
  for (const v of histOrder.slice(-recentWindow)) {
    if (v >= 0 && v < len) trend[v]++
  }
  const mc = monteCarlo(freq)
  const mxF = Math.max(...freq, 1)
  const mxD = Math.max(...delay, 1)
  const mxT = Math.max(...trend, 1)
  const mxM = Math.max(...mc, 1)
  return Array.from({ length: len }, (_, i) => ({
    n: i,
    score: 0.32 * (freq[i] / mxF) + 0.23 * (delay[i] / mxD) + 0.22 * (trend[i] / mxT) + 0.23 * (mc[i] / mxM),
  }))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sorteo = searchParams.get("sorteo") || "Todos"
  const premium = await isPremiumUser(req)

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()
  if (!SB || !SK) return NextResponse.json({ error: "Variables no configuradas" }, { status: 500 })

  const since = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
  let url = `${SB}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`
  if (sorteo !== "Todos") url += `&turno=eq.${encodeURIComponent(sorteo)}`
  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 12000)

  try {
    const res = await fetch(url, { headers: { apikey: SK, Authorization: `Bearer ${SK}` }, signal: ctrl.signal })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `DB error: ${await res.text()}` }, { status: 500 })
    const rows: Row[] = await res.json()

    if (!rows?.length) {
      return NextResponse.json({
        
        numeros: [],
        totalSorteos: 0,
        sorteo,
        generado: new Date().toISOString(),
      })
    }

    const hist: number[] = []
    const fp: number[] = []
    const freq = new Array(100).fill(0)
    const ff = new Array(100).fill(0)
    const hist3: number[] = []
    const hist4: number[] = []
    const freq3 = new Array(1000).fill(0)
    const freq4 = new Array(10000).fill(0)

    for (const row of rows) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      nums.forEach((n: unknown, i: number) => {
        const t = Number(n) % 100
        hist.push(t)
        freq[t]++
        if (i === 0) {
          fp.push(t)
          ff[t]++
        }
        const raw = Number(n)
        if (!Number.isNaN(raw)) {
          const v3 = raw % 1000
          const v4 = raw % 10000
          hist3.push(v3)
          hist4.push(v4)
          freq3[v3]++
          freq4[v4]++
        }
      })
    }

    const delay = new Array(100).fill(hist.length)
    for (let i = hist.length - 1; i >= 0; i--) {
      if (delay[hist[i]] === hist.length) delay[hist[i]] = hist.length - 1 - i
    }
    const trend = new Array(100).fill(0)
    for (const n of hist.slice(-200)) trend[n]++
    const mc = monteCarlo(freq)
    const mxF = Math.max(...freq, 1)
    const mxD = Math.max(...delay, 1)
    const mxT = Math.max(...trend, 1)
    const mxM = Math.max(...mc, 1)
    const mxFF = Math.max(...ff, 1)
    const sesgosActivos = await getSesgos((process.env.NEXT_PUBLIC_SUPABASE_URL||'').replace(/"/g,'').trim(),(process.env.SUPABASE_SERVICE_ROLE_KEY||'').replace(/"/g,'').trim())
    const scores = Array.from({ length: 100 }, (_, i) => ({
      n: i,
      score:
        0.3 * (freq[i] / mxF) +
        0.25 * (delay[i] / mxD) +
        0.2 * (trend[i] / mxT) +
        0.15 * (mc[i] / mxM) +
        0.1 * (ff[i] / mxFF),
    }))
    scores.sort((a, b) => b.score - a.score)

    const rdblCount: Record<number, number> = {}
    for (const row of rows) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      const seen = new Set<number>()
      for (const n of nums) {
        const t = Number(n) % 100
        if (seen.has(t)) rdblCount[t] = (rdblCount[t] || 0) + 1
        seen.add(t)
      }
    }
    const rdblTop5 = Object.entries(rdblCount)
      .map(([n, c]) => ({
        numero: pad(Number(n)),
        significado: SUENOS[Number(n)] || "",
        veces: c,
      }))
      .sort((a, b) => b.veces - a.veces)
      .slice(0, 5)

    const top10 = scores.slice(0, 10).map((x, i) => ({
      numero: pad(x.n),
      significado: SUENOS[x.n] || "",
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
      frecuencia: freq[x.n],
      primera: ff[x.n],
    }))

    const co = buildCooccurrence(rows)
    const pairPremium = bestRedoblonaPair(scores, co, 20)
    const redoblonaSimple = `${top10[0]?.numero ?? "00"}-${top10[1]?.numero ?? "00"}`

    const s3 = scoreDigits(freq3, hist3, 800)
    const s4 = scoreDigits(freq4, hist4, 800)
    s3.sort((a, b) => b.score - a.score)
    s4.sort((a, b) => b.score - a.score)
    const pred3d = s3.slice(0, 5).map((x, i) => ({
      numero: pad(x.n, 3),
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
    }))
    const pred4d = s4.slice(0, 5).map((x, i) => ({
      numero: pad(x.n, 4),
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
    }))

    const heatmap = freq.map((f, n) => ({ n, f, s: SUENOS[n] || "" }))

    const base = {
      tier: premium ? ("premium" as const) : ("free" as const),
      numeros: top10,
      totalSorteos: rows.length,
      sorteo,
      generado: new Date().toISOString(),
    }



    return NextResponse.json({
      ...base,
      redoblona: pairPremium.label,
      redoblonaSimple,
      redoblonaNota: "Par ponderado por score estadístico y co-aparición histórica en el mismo sorteo.",
      rdblTop5,
      pred3d: pred3d.map((p) => p.numero),
      pred3dDetail: pred3d,
      pred4d: pred4d.map((p) => p.numero),
      pred4dDetail: pred4d,
      heatmap,
    })
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }
    return NextResponse.json({ error: err?.name === "AbortError" ? "Timeout" : String(err?.message) }, { status: 500 })
  }
}
