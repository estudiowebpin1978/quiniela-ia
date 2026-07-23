import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier, FREE_MAX_PREDICTIONS } from "@/lib/auth/tier"

const SB = () => (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
const SK = () => (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const tier = await resolveUserTier(token)
    if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const userId = tier.userId

    const predRes = await fetch(
      `${SB()}/rest/v1/user_predictions?user_id=eq.${userId}&select=id,date,turno,numeros,created_at&order=created_at.desc&limit=50`,
      { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` } }
    )
    const predictions = await predRes.json()
    if (!Array.isArray(predictions)) return NextResponse.json({ predictions: [], tier })
    if (predictions.length === 0) return NextResponse.json({ predictions: [], tier })

    const uniqueDates = [...new Set(predictions.map((p: any) => (p.date || "").trim()).filter(Boolean))]

    const drawsMap: Record<string, any> = {}
    if (uniqueDates.length > 0) {
      const batchSize = 20
      for (let i = 0; i < uniqueDates.length; i += batchSize) {
        const batch = uniqueDates.slice(i, i + batchSize)
        const dateFilter = batch.map(d => `date.eq.${d}`).join(",")
        try {
          const drawsRes = await fetch(
            `${SB()}/rest/v1/draws?or=(${dateFilter})&select=numbers,turno,date&limit=200`,
            { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
          )
          if (drawsRes.ok) {
            const draws = await drawsRes.json()
            if (Array.isArray(draws)) {
              for (const d of draws) {
                const key = `${d.date}|${(d.turno || "").toLowerCase()}`
                if (d.numbers && Array.isArray(d.numbers) && d.numbers.length >= 5) {
                  drawsMap[key] = d
                }
              }
            }
          }
        } catch { /* noop */ }
      }
    }

    const predIds = predictions.map((p: any) => p.id).filter(Boolean)
    const historyMap: Record<string, any> = {}
    if (predIds.length > 0) {
      try {
        const batchSize = 50
        for (let i = 0; i < predIds.length; i += batchSize) {
          const batch = predIds.slice(i, i + batchSize)
          const histRes = await fetch(
            `${SB()}/rest/v1/prediction_history?prediction_id=in.(${batch.join(",")})&select=prediction_id,aciertos_2,aciertos_3,aciertos_4,total_aciertos,resultado_oficial`,
            { headers: { "apikey": SK(), "Authorization": `Bearer ${SK()}` }, signal: AbortSignal.timeout(8000) }
          )
          if (histRes.ok) {
            const hist = await histRes.json()
            if (Array.isArray(hist)) {
              for (const h of hist) {
                if (h.prediction_id) historyMap[h.prediction_id] = h
              }
            }
          }
        }
      } catch { /* noop */ }
    }

    const results = []
    for (const pred of predictions) {
      const rawTurno = pred.turno || ""
      const turnoLower = rawTurno.replace(/-\d+cifras?$/i, "").toLowerCase().trim()
      const predDate = (pred.date || "").trim()
      const drawKey = `${predDate}|${turnoLower}`
      const draw = drawsMap[drawKey] || null
      const history = historyMap[pred.id] || null
      const disponible = !!draw

      let aciertos: any[] = []
      let aciertos3: any[] = []
      let aciertos4: any[] = []
      let numerosReales: string[] = []
      let numerosReales3: string[] = []
      let numerosReales4: string[] = []

      let numerosData: any = pred.numeros
      if (Array.isArray(numerosData) && numerosData.length === 1 && typeof numerosData[0] === "string") {
        try { numerosData = JSON.parse(numerosData[0]) } catch { /* noop */ }
      }
      const pred2: string[] = Array.isArray(numerosData) ? numerosData : (numerosData?.["2"] || [])
      let pred3: string[] = []
      let pred4: string[] = []
      if (!Array.isArray(numerosData) && tier.canAccessPremiumFeatures) {
        pred3 = numerosData?.["3"] || []
        pred4 = numerosData?.["4"] || []
      }

      if (history) {
        aciertos = (history.aciertos_2 || []).map((a: any) => ({ ...a, tipo: 2 }))
        if (tier.canAccessPremiumFeatures) {
          aciertos3 = (history.aciertos_3 || []).map((a: any) => ({ ...a, tipo: 3 }))
          aciertos4 = (history.aciertos_4 || []).map((a: any) => ({ ...a, tipo: 4 }))
        }
        const resultNums = history.resultado_oficial || []
        numerosReales = resultNums.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
        numerosReales3 = resultNums.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
        numerosReales4 = resultNums.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))
      } else if (draw?.numbers && Array.isArray(draw.numbers)) {
        numerosReales = draw.numbers.map((n: number) => String(Number(n) % 100).padStart(2, "0"))
        numerosReales3 = draw.numbers.map((n: number) => String(Number(n) % 1000).padStart(3, "0"))
        numerosReales4 = draw.numbers.map((n: number) => String(Number(n) % 10000).padStart(4, "0"))

        const predNumeros2 = pred2.map((n: string) => String(n).padStart(2, "0"))
        aciertos = predNumeros2.filter((n: string) => numerosReales.includes(n)).map((n: string) => ({
          numero: n, puesto: numerosReales.indexOf(n) + 1, tipo: 2
        }))

        if (pred3.length > 0) {
          const predNumeros3 = pred3.map((n: string) => String(n).padStart(3, "0"))
          aciertos3 = predNumeros3.filter((n: string) => numerosReales3.includes(n)).map((n: string) => ({
            numero: n, puesto: numerosReales3.indexOf(n) + 1, tipo: 3
          }))
        }

        if (pred4.length > 0) {
          const predNumeros4 = pred4.map((n: string) => String(n).padStart(4, "0"))
          aciertos4 = predNumeros4.filter((n: string) => numerosReales4.includes(n)).map((n: string) => ({
            numero: n, puesto: numerosReales4.indexOf(n) + 1, tipo: 4
          }))
        }
      }

      const allAciertos = [...aciertos, ...aciertos3, ...aciertos4]
      const hasResult = !!history || disponible

      results.push({
        id: pred.id, fecha: pred.date, turno: pred.turno,
        numeros: pred2,
        numeros_3: pred3,
        numeros_4: pred4,
        resultado: hasResult && numerosReales.length > 0 ? numerosReales : null,
        resultado_3: hasResult && numerosReales3.length > 0 ? numerosReales3 : null,
        resultado_4: hasResult && numerosReales4.length > 0 ? numerosReales4 : null,
        resultado_original: (hasResult && (history?.resultado_oficial || draw?.numbers)) || null,
        aciertos: hasResult ? allAciertos : [],
        aciertos_2: hasResult ? aciertos : [],
        aciertos_3: hasResult ? aciertos3 : [],
        aciertos_4: hasResult ? aciertos4 : [],
        acerto: hasResult ? allAciertos.length > 0 : false,
        created_at: pred.created_at,
        sorteoRealizado: hasResult
      })
    }

    return NextResponse.json({
      predictions: results,
      tier: {
        role: tier.role,
        isPremium: tier.isPremium,
        isTrialActive: tier.isTrialActive,
        trialExpired: tier.trialExpired,
        predictionsUsed: tier.predictionsUsed,
        predictionsRemaining: tier.predictionsRemaining,
        maxFree: FREE_MAX_PREDICTIONS,
      },
    })
  } catch {
    return NextResponse.json({ predictions: [], error: "Error cargando predicciones" })
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  const SB_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/"/g, "").trim()
  const SK_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "").replace(/"/g, "").trim()

  try {
    const tier = await resolveUserTier(token)
    if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    if (tier.trialExpired && !tier.isPremium) {
      return NextResponse.json({
        error: "Tu período de prueba ha expirado. Actualizá a Premium para continuar.",
        trialExpired: true,
      }, { status: 403 })
    }

    if (!tier.canSavePrediction) {
      return NextResponse.json({
        error: `Límite free alcanzado (${FREE_MAX_PREDICTIONS} predicciones). Actualizá a Premium para guardar más.`,
        limitReached: true,
        predictionsUsed: tier.predictionsUsed,
        max: FREE_MAX_PREDICTIONS,
      }, { status: 403 })
    }

    const userId = tier.userId
    const { date, turno, numeros } = await req.json()
    const hasNumeros = Array.isArray(numeros)
      ? numeros.length > 0
      : numeros && typeof numeros === "object" && Object.keys(numeros).length > 0
    if (!date || !turno || !hasNumeros) {
      return NextResponse.json({ error: "Faltan campos" }, { status: 400 })
    }

    let numerosToStore: any
    if (tier.canAccessPremiumFeatures) {
      numerosToStore = Array.isArray(numeros) ? numeros : [JSON.stringify(numeros)]
    } else {
      const only2 = Array.isArray(numeros)
        ? numeros
        : (numeros?.["2"] || numeros?.numeros_2 || [])
      numerosToStore = only2
    }

    const checkRes = await fetch(
      `${SB_URL}/rest/v1/user_predictions?user_id=eq.${userId}&date=eq.${date}&turno=eq.${turno}&select=id&limit=1`,
      { headers: { "apikey": SK_KEY, "Authorization": `Bearer ${SK_KEY}` } }
    )
    const existing = await checkRes.json()
    if (Array.isArray(existing) && existing.length > 0) {
      return NextResponse.json({ error: "Ya guardaste un análisis para este turno", duplicate: true }, { status: 409 })
    }

    const insertData = {
      user_id: userId,
      date,
      turno,
      numeros: numerosToStore,
    }

    const r = await fetch(`${SB_URL}/rest/v1/user_predictions`, {
      method: "POST",
      headers: {
        "apikey": SK_KEY,
        "Authorization": `Bearer ${SK_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(insertData),
    })

    const responseText = await r.text()
    if (!r.ok) {
      return NextResponse.json({ error: "Error guardando predicción" }, { status: 500 })
    }

    let inserted = null
    try { inserted = JSON.parse(responseText) } catch { /* noop */ }

    return NextResponse.json({
      ok: true,
      prediction: Array.isArray(inserted) ? inserted[0] : inserted,
      predictionsRemaining: tier.isPremium ? -1 : Math.max(0, FREE_MAX_PREDICTIONS - tier.predictionsUsed - 1),
    })
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 })
  }
}
