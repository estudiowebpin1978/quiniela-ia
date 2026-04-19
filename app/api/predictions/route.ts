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
  const samples = Math.min(25000, 5000 + freq.length * 25)
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
      const num = Number(n)
      if (Number.isNaN(num)) continue
      const t = num % 100
      if (t >= 0 && t <= 99 && !set.has(t)) {
        set.add(t)
        list.push(t)
      }
    }

    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = Math.min(list[i], list[j])
        const b = Math.max(list[i], list[j])
        if (a >= 0 && a <= 99 && b >= 0 && b <= 99) {
          co[a][b]++
        }
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

function normalize(values: number[]) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values)
  if (max === min) return values.map(() => 0)
  return values.map((v) => (v - min) / (max - min))
}

function nextDrawDay(sorteo: string) {
  const ar = new Date(Date.now() - 3 * 3600000)
  const now = ar.getHours() * 100 + ar.getMinutes()
  const h: Record<string, number> = { Previa: 1015, Primera: 1200, Matutina: 1500, Vespertina: 1800, Nocturna: 2100 }
  const target = new Date(ar)
  if (now >= (h[sorteo] || 2100)) target.setDate(target.getDate() + 1)
  return target.toLocaleDateString("es-AR", { weekday: "long" })
}

function buildDayOfWeekBias(rows: Row[], targetDay: string) {
  const bias = new Array(100).fill(0)
  let total = 0
  for (const row of rows) {
    if (!row?.date) continue
    const date = new Date(row.date + "T00:00:00")
    if (date.toLocaleDateString("es-AR", { weekday: "long" }) !== targetDay) continue
    const nums = Array.isArray(row.numbers) ? row.numbers : []
    for (const n of nums) {
      const num = Number(n)
      if (Number.isNaN(num)) continue
      const t = num % 100
      if (t >= 0 && t <= 99) {
        bias[t]++
        total++
      }
    }
  }
  if (!total) return bias
  return bias.map((count) => count / total)
}

function buildPatternBias(hist: number[], recentWindow: number) {
  const recent = hist.slice(-recentWindow)
  if (!recent.length) return new Array(100).fill(0)
  let even = 0,
    odd = 0,
    low = 0,
    high = 0
  for (const n of recent) {
    if (n % 2 === 0) even++
    else odd++
    if (n < 50) low++
    else high++
  }
  const evenRatio = even / recent.length
  const oddRatio = odd / recent.length
  const lowRatio = low / recent.length
  const highRatio = high / recent.length
  return Array.from({ length: 100 }, (_, i) => {
    const parity = i % 2 === 0 ? evenRatio : oddRatio
    const range = i < 50 ? lowRatio : highRatio
    return 0.5 * parity + 0.5 * range
  })
}

function scoreDigits(
  freq: number[],
  histOrder: number[],
  recentWindow: number,
  firstPos?: number[],
  dayOfWeekBias?: number[],
  patternBias?: number[],
  sesgoSet?: Set<number>
) {
  const len = freq.length
  firstPos = firstPos && firstPos.length === len ? firstPos : new Array(len).fill(0)
  dayOfWeekBias = dayOfWeekBias && dayOfWeekBias.length === len ? dayOfWeekBias : new Array(len).fill(0)
  patternBias = patternBias && patternBias.length === len ? patternBias : new Array(len).fill(0)
  sesgoSet = sesgoSet || new Set<number>()
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
  const freqNorm = normalize(freq)
  const delayNorm = normalize(delay)
  const trendNorm = normalize(trend)
  const mcNorm = normalize(mc)
  const firstNorm = normalize(firstPos)
  const dayNorm = normalize(dayOfWeekBias)
  const patternNorm = normalize(patternBias)

  return Array.from({ length: len }, (_, i) => ({
    n: i,
    score:
      0.2 * freqNorm[i] +
      0.18 * delayNorm[i] +
      0.16 * trendNorm[i] +
      0.12 * mcNorm[i] +
      0.08 * firstNorm[i] +
      0.14 * dayNorm[i] +
      0.1 * patternNorm[i] +
      (sesgoSet.has(i) ? 0.02 : 0),
  }))
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  const sorteo = searchParams.get("sorteo") || "Todos"

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

  console.log("SB URL:", SB ? "SET" : "EMPTY")
  console.log("SK Key:", SK ? "SET" : "EMPTY")

  // Verificar si es premium desde el token
  let premium = false
  if (token && SB && SK) {
    try {
      const userRes = await fetch(`${SB}/auth/v1/user`, {
        headers: { "apikey": SK, "Authorization": `Bearer ${token}` },
        signal: AbortSignal.timeout(5000),
      })
      if (userRes.ok) {
        const user = await userRes.json()
        const profRes = await fetch(
          `${SB}/rest/v1/user_profiles?id=eq.${user.id}&select=role,premium_until&limit=1`,
          { headers: { "apikey": SK, "Authorization": `Bearer ${SK}` } }
        )
        if (profRes.ok) {
          const profiles = await profRes.json()
          const profile = profiles?.[0]
          premium = profile?.role === "admin" ||
            (profile?.role === "premium" && profile?.premium_until && new Date(profile.premium_until) > new Date())
        }
      }
    } catch {}
  }

  // Validar variables de entorno
  console.log("=== DEBUG ENV ===")
  console.log("NEXT_PUBLIC_SUPABASE_URL:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "SET" : "NOT SET")
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "SET" : "NOT SET")
  console.log("SUPABASE_SERVICE_ROLE_KEY:", process.env.SUPABASE_SERVICE_ROLE_KEY ? "SET" : "NOT SET")
  console.log("SUPABASE_SERVICE_KEY:", process.env.SUPABASE_SERVICE_KEY ? "SET" : "NOT SET")
  console.log("SB value:", SB)
  console.log("SK value:", SK ? "HAS VALUE" : "EMPTY")
  console.log("=================")
  
  if (!SB || !SK) {
    return NextResponse.json({ 
      error: "Configuración incompleta: Variables de entorno no definidas",
      debug: { sb: !!SB, sk: !!SK },
      numeros: [],
      totalSorteos: 0,
      sorteo,
      generado: new Date().toISOString()
    }, { status: 500 })
  }

  // Validar parámetro sorteo
  const sorteoValidos = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Todos"]
  if (sorteo !== "Todos" && !sorteoValidos.includes(sorteo)) {
    return NextResponse.json({ 
      error: `Sorteo inválido. Válidos: ${sorteoValidos.join(", ")}`,
      numeros: [],
      totalSorteos: 0,
      sorteo,
      generado: new Date().toISOString()
    }, { status: 400 })
  }

  const since = new Date(Date.now() - 365 * 86400000).toISOString().split("T")[0]
  let url = `${SB}/rest/v1/draws?select=date,turno,numbers&date=gte.${since}&order=date.desc&limit=2000`
  if (sorteo !== "Todos") url += `&turno=eq.${encodeURIComponent(sorteo)}`

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 15000)

  try {
    const res = await fetch(url, { 
      headers: { 
        apikey: SK, 
        Authorization: `Bearer ${SK}` 
      }, 
      signal: ctrl.signal 
    })
    clearTimeout(to)

    if (!res.ok) {
      const errText = await res.text()
      return NextResponse.json({ 
        error: `Base de datos error: ${res.status} - ${errText.substring(0, 100)}`,
        numeros: [],
        totalSorteos: 0,
        sorteo,
        generado: new Date().toISOString()
      }, { status: 500 })
    }

    const rows: Row[] = await res.json()

    if (!rows?.length) {
      return NextResponse.json({
        numeros: [],
        totalSorteos: 0,
        sorteo,
        generado: new Date().toISOString(),
        aviso: `Sin datos disponibles para ${sorteo} en el último año`
      })
    }

    // Validar que tenemos números válidos
    const rowsValidos = rows.filter(r => Array.isArray(r.numbers) && r.numbers.length > 0)
    if (!rowsValidos.length) {
      return NextResponse.json({
        numeros: [],
        totalSorteos: rows.length,
        sorteo,
        generado: new Date().toISOString(),
        aviso: "Los registros no contienen números válidos"
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

    for (const row of rowsValidos) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      nums.forEach((n: unknown, i: number) => {
        const num = Number(n)
        if (Number.isNaN(num)) return

        const t = num % 100
        if (t >= 0 && t <= 99) {
          hist.push(t)
          freq[t]++

          if (i === 0) {
            fp.push(t)
            ff[t]++
          }

          const v3 = num % 1000
          const v4 = num % 10000
          hist3.push(v3)
          hist4.push(v4)
          freq3[v3]++
          freq4[v4]++
        }
      })
    }

    // Validar que tenemos datos procesados
    if (!hist.length) {
      return NextResponse.json({
        numeros: [],
        totalSorteos: rowsValidos.length,
        sorteo,
        generado: new Date().toISOString(),
        aviso: "Error procesando datos históricos"
      }, { status: 500 })
    }

    // Calcular delays (cuándo fue la última aparición de cada número)
    const delay = new Array(100).fill(hist.length)
    for (let i = hist.length - 1; i >= 0; i--) {
      const num = hist[i]
      if (num >= 0 && num <= 99 && delay[num] === hist.length) {
        delay[num] = hist.length - 1 - i
      }
    }

    // Calcular tendencia reciente (últimos 200 sorteos)
    const trend = new Array(100).fill(0)
    const recentWindow = Math.min(200, hist.length)
    for (const n of hist.slice(-recentWindow)) {
      if (n >= 0 && n <= 99) trend[n]++
    }

    // Muestreo Monte Carlo para distribuición probabilística
    const mc = monteCarlo(freq)

    // Normalizar scores
    const mxF = Math.max(...freq, 1)
    const mxD = Math.max(...delay, 1)
    const mxT = Math.max(...trend, 1)
    const mxM = Math.max(...mc, 1)
    const mxFF = Math.max(...ff, 1)

    // Obtener sesgos activos de configuración (si existen)
    const sesgosActivos = await getSesgos(SB, SK)
    const sesgoSet = new Set<number>(
      (sesgosActivos[sorteo] || [])
        .map((n) => Number(n))
        .filter((n) => !Number.isNaN(n) && n >= 0 && n < 100)
    )

    const targetDay = nextDrawDay(sorteo)
    const dayOfWeekBias = buildDayOfWeekBias(rowsValidos, targetDay)
    const patternBias = buildPatternBias(hist, recentWindow)

    const scores = scoreDigits(freq, hist, recentWindow, ff, dayOfWeekBias, patternBias, sesgoSet)
    scores.sort((a, b) => b.score - a.score)

    // Análisis de redoblona: números que salen juntos frecuentemente
    const rdblCount: Record<number, number> = {}
    for (const row of rowsValidos) {
      const nums = Array.isArray(row.numbers) ? row.numbers : []
      const seen = new Set<number>()
      for (const n of nums) {
        const num = Number(n)
        if (Number.isNaN(num)) continue
        const t = num % 100
        if (t >= 0 && t <= 99) {
          if (seen.has(t)) rdblCount[t] = (rdblCount[t] || 0) + 1
          seen.add(t)
        }
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

    // Top 10 números para 2 cifras
    const top10 = scores.slice(0, 10).map((x, i) => ({
      n: x.n,
      numero: pad(x.n),
      significado: SUENOS[x.n] || "",
      score: Math.round(x.score * 10000) / 10000,
      rank: i + 1,
      frecuencia: freq[x.n],
      primera: ff[x.n],
    }))

    // Matriz de coocurrencias para redoblona premium
    const co = buildCooccurrence(rowsValidos)
    const pairPremium = bestRedoblonaPair(scores, co, 20)
    const redoblonaSimple = `${top10[0]?.numero ?? "00"}-${top10[1]?.numero ?? "00"}`

    // Predicciones de 3 y 4 dígitos (calculadas con los mejores)
    const s3 = scoreDigits(freq3, hist3, Math.min(800, hist3.length))
    const s4 = scoreDigits(freq4, hist4, Math.min(800, hist4.length))
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

    // Mapa de calor (heatmap) con frecuencias
    const heatmap = freq.map((f, n) => ({ 
      n, 
      f, 
      s: SUENOS[n] || "",
      pct: Math.round((f / hist.length) * 10000) / 100 // Porcentaje de aparición
    }))

    const confidence = Math.round((scores.slice(0, 10).reduce((sum, x) => sum + x.score, 0) / 10) * 100)
    const aiInsight = `Motor avanzado: combina frecuencia, atraso, tendencia, Monte Carlo, momento del sorteo, patrones par/impar y bajo/alto, y sesgos de sorteo. Confianza estimada ${confidence}% en la lista top.`

    const base = {
      tier: premium ? ("premium" as const) : ("free" as const),
      numeros: top10,
      totalSorteos: rowsValidos.length,
      sorteo,
      generado: new Date().toISOString(),
      analisisDesde: since,
      diasAnalisis: Math.floor((new Date().getTime() - new Date(since).getTime()) / 86400000),
      confidence,
      aiInsight,
    }

    // Formato compatible con frontend
    const pred = {
      numeros_2: top10.map(n => n.numero),
      numeros_3: pred3d.map(p => p.numero),
      numeros_4: pred4d.map(p => p.numero),
      redoblona: pairPremium.label,
      ranking: top10.map((n) => ({ numero: n.numero, score: n.score, prob: Math.round((freq[n.n] / hist.length) * 10000) / 100 })),
    }

    return NextResponse.json({
      ...base,
      pred,
      redoblona: pairPremium.label,
      redoblonaSimple,
      redoblonaNota: `Par ponderado: ${pairPremium.label}. Analisis de ${rowsValidos.length} sorteos.`,
      rdblTop5,
      pred3d: pred3d.map((p) => p.numero),
      pred3dDetail: pred3d,
      pred4d: pred4d.map((p) => p.numero),
      pred4dDetail: pred4d,
      heatmap,
      stats: {
        totalNumeros: rowsValidos.length,
        promedioNumerosPorSorteo: (hist.length / rowsValidos.length).toFixed(2),
        numeroMasFrecuente: { numero: pad(scores[0]?.n || 0), frecuencia: freq[scores[0]?.n || 0], significado: SUENOS[scores[0]?.n || 0] },
        numeroMenosFrecuente: { numero: pad(scores[99]?.n || 0), frecuencia: freq[scores[99]?.n || 0], significado: SUENOS[scores[99]?.n || 0] },
      }
    })
  } catch (e: unknown) {
    clearTimeout(to)
    const err = e as { name?: string; message?: string }

    // Detectar el tipo de error
    let errorMsg = "Error desconocido procesando análisis"
    let statusCode = 500

    if (err?.name === "AbortError") {
      errorMsg = "Timeout: El análisis tomó demasiado tiempo (>15s). Intenta de nuevo."
      statusCode = 504
    } else if (err?.message?.includes("fetch")) {
      errorMsg = "Error de conexión a la base de datos"
      statusCode = 503
    } else if (err?.message) {
      errorMsg = `Error: ${err.message.substring(0, 80)}`
    }

    return NextResponse.json({ 
      error: errorMsg,
      numeros: [],
      totalSorteos: 0,
      sorteo,
      generado: new Date().toISOString()
    }, { status: statusCode })
  }
}
