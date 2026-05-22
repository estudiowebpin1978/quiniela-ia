import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()

function pad(n: number): string { return String(n).padStart(2, "0") }

const PESOS = { freq: 0.18, pos: 0.10, recencia: 0.14, tendencia: 0.10, ciclo: 0.10, cooc: 0.08, ausencia: 0.08, caliente: 0.05, atrasado: 0.05, turno: 0.05, paridad: 0.04, sumaDig: 0.03 }

function walkforwardScore(n: number, datos: { terminaciones: number[]; recenciaTerm: Record<number,number>; tendencia: Record<number,number>; cooc: Record<string,number>; ultimoIdx: Record<number,number>; maxIdx: number; ciclos: Record<number,{promedio:number;ultimo:number}>; calientes: Set<number>; atrasados: Set<number>; paridadMayor: "par"|"impar"; sumaTop: Set<number> }): number {
  const f = datos.terminaciones.filter(t => t === n).length / datos.terminaciones.length * 100
  let s = f * PESOS.freq
  const r = datos.recenciaTerm[n] || 0; s += Math.min(100, r * 10) * PESOS.recencia
  const t = datos.tendencia[n] || 0
  s += (t > 0 ? 50 + Math.min(50, t * 10) : 50 - Math.min(50, Math.abs(t) * 5)) * PESOS.tendencia
  const c = datos.ciclos[n]
  if (c) s += (c.ultimo - c.promedio >= -2 ? 70 : 30) * PESOS.ciclo; else s += 40 * PESOS.ciclo
  const co = Object.entries(datos.cooc).filter(([k]) => k.includes(`-${n}`) || k.includes(`${n}-`)).reduce((a,[,v]) => a+v, 0)
  s += Math.min(100, co * 5) * PESOS.cooc
  const aus = datos.maxIdx - (datos.ultimoIdx[n] || 0)
  s += (aus < 5 ? 80 : aus < 15 ? 50 : 20) * PESOS.ausencia
  if (datos.calientes.has(n)) s += 80 * PESOS.caliente; else s += 30 * PESOS.caliente
  if (datos.atrasados.has(n)) s += 20 * PESOS.atrasado; else s += 60 * PESOS.atrasado
  s += (datos.paridadMayor === (n % 2 === 0 ? 'par' : 'impar') ? 70 : 30) * PESOS.paridad
  const sd = Math.floor(n / 10) + (n % 10)
  s += (datos.sumaTop.has(sd) ? 80 : 30) * PESOS.sumaDig
  return s
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autenticado" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno")?.toLowerCase() || "nocturna"
  const topN = Math.min(Math.max(parseInt(searchParams.get("top") || "10"), 1), 20)
  const minEntreno = Math.max(parseInt(searchParams.get("min") || "30"), 10)

  try {
    const res = await fetch(`${SB()}/rest/v1/draws?select=date,turno,numbers&turno=ilike.*${turno}*&order=date.asc&limit=10000`, {
      headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }
    })
    if (!res.ok) return NextResponse.json({ error: `Supabase ${res.status}` }, { status: 500 })
    const rows: any[] = await res.json()
    const draws: number[][] = rows.filter((r:any) => Array.isArray(r.numbers) && r.numbers.length >= 20).map((r:any) => (r.numbers as number[]).map((n:any)=>Number(n)).filter((n:number)=>!isNaN(n)&&n>=0&&n<=9999))
    if (draws.length < minEntreno + 10) return NextResponse.json({ error: `Solo ${draws.length} sorteos, minimo ${minEntreno + 10}` }, { status: 400 })

    const resultados: { total: number; aciertosTop: number; aciertosTotal: number; hitsPorSorteo: number[] } = { total: 0, aciertosTop: 0, aciertosTotal: 0, hitsPorSorteo: [] }

    for (let i = minEntreno; i < draws.length; i++) {
      const train = draws.slice(0, i)
      const actual = draws[i]

      const terminaciones: number[] = []
      for (const d of train) for (const n of d) terminaciones.push(n % 100)

      const recenciaTerm: Record<number,number> = {}
      for (const d of train.slice(-7)) { for (const n of d) { const t = n % 100; recenciaTerm[t] = (recenciaTerm[t] || 0) + 1 } }

      const r7 = train.slice(-7); const a7 = train.slice(-14, -7)
      const tendencia: Record<number,number> = {}
      for (let t = 0; t < 100; t++) {
        const rr = r7.filter(d => d.some((n: number) => n % 100 === t)).length
        const aa = a7.filter(d => d.some((n: number) => n % 100 === t)).length
        tendencia[t] = ((rr/7) - (aa/7)) * 100
      }

      const cooc: Record<string,number> = {}
      for (const d of train) { const nums: number[] = d as number[]; const u: number[] = [...new Set(nums.map((n: number) => n % 100))]; for (let a = 0; a < u.length; a++) for (let b = a+1; b < u.length; b++) { const k = `${Math.min(u[a],u[b])}-${Math.max(u[a],u[b])}`; cooc[k] = (cooc[k] || 0) + 1 } }

      const ultimoIdx: Record<number,number> = {}
      train.forEach((d: any, idx: number) => { const nums: number[] = d as number[]; for (const n of nums) ultimoIdx[n % 100] = idx })

      const ciclos: Record<number,{promedio:number;ultimo:number}> = {}
      const apariciones: Record<number,number[]> = {}
      train.forEach((d: any, idx: number) => { const nums: number[] = d as number[]; const u: number[] = [...new Set(nums.map((n: number) => n % 100))]; for (const t of u) { if (!apariciones[t]) apariciones[t] = []; apariciones[t].push(idx) } })
      for (const [k, v] of Object.entries(apariciones)) { const n = parseInt(k); if (v.length > 1) { let sum = 0; for (let j = 1; j < v.length; j++) sum += v[j] - v[j-1]; ciclos[n] = { promedio: sum / (v.length-1), ultimo: i - 1 - (ultimoIdx[n] || 0) } } }

      const calientes = new Set(Object.entries(recenciaTerm).filter(([,v]: [string, number]) => v >= 5).map(([k]: [string, number]) => parseInt(k)))
      const atrasados = new Set(Object.keys(ultimoIdx).filter(k => (i - 1 - (ultimoIdx[parseInt(k)] || 0)) >= 15).map(Number))
      const pares = terminaciones.filter(t => t % 2 === 0).length
      const paridadMayor: "par"|"impar" = pares >= terminaciones.length - pares ? "par" : "impar"
      const sumaArr: Record<number,number> = {}; for (const t of terminaciones) { const sd = Math.floor(t/10) + (t%10); sumaArr[sd] = (sumaArr[sd] || 0) + 1 }
      const sumaTop = new Set(Object.entries(sumaArr).sort((a,b) => b[1]-a[1]).slice(0,5).map(([k]) => parseInt(k)))

      const scores: {n:number;s:number}[] = []
      for (let n = 0; n < 100; n++) scores.push({n, s: walkforwardScore(n, {terminaciones, recenciaTerm, tendencia, cooc, ultimoIdx, maxIdx: i-1, ciclos, calientes, atrasados, paridadMayor, sumaTop})})
      scores.sort((a,b) => b.s - a.s)
      const preds = new Set(scores.slice(0, topN).map(x => x.n))

      const actualTerminos = [...new Set(actual.map(n => n % 100))]
      const hits = actualTerminos.filter(t => preds.has(t))
      if (hits.length > 0) { resultados.aciertosTop++; resultados.aciertosTotal += hits.length }
      resultados.total++
      resultados.hitsPorSorteo.push(hits.length)
    }

    return NextResponse.json({
      ok: true,
      params: { turno, topN, minEntreno, sorteosTesteados: resultados.total },
      metrica: "walk-forward: entrena con datos PASADOS, testea con datos FUTUROS (sin data leakage)",
      aciertos: resultados.aciertosTop,
      aciertosTotal: resultados.aciertosTotal,
      hitRate: resultados.total > 0 ? Math.round((resultados.aciertosTop / resultados.total) * 10000) / 100 : 0,
      avgHits: resultados.total > 0 ? Math.round((resultados.aciertosTotal / resultados.total) * 100) / 100 : 0,
      maxHits: Math.max(...resultados.hitsPorSorteo),
      distribucion: resultados.hitsPorSorteo.reduce((acc:Record<number,number>, h) => { acc[h] = (acc[h] || 0) + 1; return acc }, {} as Record<number,number>),
      conclusion: resultados.total > 0
        ? `En ${resultados.total} sorteos testeados, el método 12 factores acertó al menos 1 número en ${resultados.aciertosTop} sorteos (${Math.round(resultados.aciertosTop/resultados.total*100)}% de los sorteos). Promedio: ${(resultados.aciertosTotal/resultados.total).toFixed(2)} aciertos/sorteo.`
        : "Sin datos suficientes"
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 })
  }
}
