import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const turno = searchParams.get("turno") || "todos"
  const incluirRF = searchParams.get("rf") !== "false"
  const incluirMarkov = searchParams.get("markov") !== "false"
  const incluirNN = searchParams.get("nn") !== "false"

  const SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").replace(/"/g, "").trim()
  if (!SB || !SK) return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 })

  const ctrl = new AbortController()
  const to = setTimeout(() => ctrl.abort(), 120000)

  try {
    let url = `${SB}/rest/v1/draws?select=date,turno,numbers&order=date.desc&limit=5000`
    if (turno !== "todos") url += `&turno=ilike.*${turno}*`

    const res = await fetch(url, {
      headers: { "apikey": SK, "Authorization": `Bearer ${SK}` },
      signal: ctrl.signal
    })
    clearTimeout(to)
    if (!res.ok) return NextResponse.json({ error: `Error: ${res.status}` }, { status: 500 })

    const rows: any[] = await res.json()
    if (!rows?.length || rows.length < 50)
      return NextResponse.json({ error: "Datos insuficientes (mínimo 50 sorteos)" }, { status: 500 })

    const sorteos = rows
      .filter((r: any) => Array.isArray(r.numbers) && r.numbers.length >= 20)
      .map((r: any) => ({
        fecha: r.date,
        turno: r.turno,
        numbers: r.numbers.map((n: any) => Number(n)).filter((n: number) => !isNaN(n))
      }))

    const { entrenarModelos, prepararPrediccion } = await import("@/lib/ml/trainer")
    const resultado = await entrenarModelos(sorteos, { incluirRF, incluirMarkov, incluirNN })

    const { predecirSiguienteMarkov, evaluarModeloMarkov } = await import("@/lib/ml/markov")
    const { predecirRandomForest } = await import("@/lib/ml/random-forest")
    const { predecirRedNeuronal, predecirMultipleClases } = await import("@/lib/ml/neural")

    const topPredictions: Record<string, { numero: string; confianza: number }[]> = {}

    if (resultado.mejorModelo) {
      const ordenados = [...sorteos].sort((a: any, b: any) =>
        new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
      ).filter((s: any) => Array.isArray(s.numbers) && s.numbers.length > 0)
      const vectorPrediccion = prepararPrediccion(ordenados)

      const primerosDraws = ordenados.map((s: any) => s.numbers[0] % 100)

      for (const modelo of resultado.modelos) {
        const preds: { numero: string; confianza: number }[] = []
        const seen = new Set<number>()

        if (modelo.tipo === "markov") {
          const estadoMarkov = [primerosDraws[primerosDraws.length - 2], primerosDraws[primerosDraws.length - 1]]
          const markovPred = predecirSiguienteMarkov(modelo.modelo as any, estadoMarkov, 10)
          for (const p of markovPred.topK) {
            if (!seen.has(p.estado)) {
              seen.add(p.estado)
              preds.push({ numero: String(p.estado).padStart(2, "0"), confianza: p.probabilidad })
            }
          }
        } else if (modelo.tipo === "random-forest") {
          const rfPred = predecirRandomForest(modelo.modelo as any, vectorPrediccion)
          const probs = rfPred.probabilidades.map((p: number, i: number) => ({ estado: i, prob: p }))
            .sort((a: any, b: any) => b.prob - a.prob)
          for (const p of probs.slice(0, 10)) {
            if (!seen.has(p.estado)) {
              seen.add(p.estado)
              preds.push({ numero: String(p.estado).padStart(2, "0"), confianza: Math.round(p.prob * 100) })
            }
          }
        } else if (modelo.tipo === "neural") {
          const nnTop = predecirMultipleClases(modelo.modelo as any, vectorPrediccion, 10)
          for (const p of nnTop) {
            if (!seen.has(p.clase)) {
              seen.add(p.clase)
              preds.push({ numero: String(p.clase).padStart(2, "0"), confianza: Math.round(p.probabilidad) })
            }
          }
        }

        topPredictions[modelo.tipo] = preds.slice(0, 10)
      }
    }

    const mejor = resultado.mejorModelo

    return NextResponse.json({
      ok: true,
      turno,
      modelosEntrenados: resultado.modelos.length,
      mejorModelo: mejor ? { nombre: mejor.nombre, tipo: mejor.tipo, precision: mejor.precision } : null,
      metricas: resultado.modelos.map(m => ({
        nombre: m.nombre, tipo: m.tipo,
        precision: m.precision,
        metricas: m.metricas
      })),
      predicciones: topPredictions,
      datos: resultado.datosEntrenamiento,
      tiempoMs: resultado.tiempoTotal,
      generado: new Date().toISOString()
    })
  } catch (e: any) {
    clearTimeout(to)
    return NextResponse.json({ error: e.message || "Error en ML" }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    mensaje: "API de ML Training",
    uso: "POST /api/ml-training?turno=previa&rf=true&markov=true&nn=true",
    modelos: ["Random Forest (rf)", "Cadena de Markov (markov)", "Red Neuronal (nn)"]
  })
}
