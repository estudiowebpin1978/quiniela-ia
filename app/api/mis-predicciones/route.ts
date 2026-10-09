import { NextRequest, NextResponse } from "next/server"
import { resolveUserTier, FREE_MAX_PREDICTIONS } from "@/lib/auth/tier"
import { GAME_ID } from "@/lib/scrapers/types"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import logger from "@/lib/logger"
import type { PredictionHistoryRow, DrawRow } from "@/lib/api/types"
import { calcularAciertosApi } from "@/lib/verificacion/api-aciertos"

// In-memory rate limiter for POST
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  try {
    const tier = await resolveUserTier(token)
    if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })
    const userId = tier.userId

    const supabase = getSupabaseAdmin()

    let { data: predictions, error: predErr } = await supabase
      .from("user_predictions")
      .select("id,date,turno,numeros,created_at,status,aciertos,verified_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50)

    if (predErr || !predictions?.length) {
      return NextResponse.json({ predictions: [], tier })
    }

    const uniqueDates = [...new Set(predictions.map((p) => (p.date || "").trim()).filter(Boolean))]

    // ── INLINE AUTO-VERIFY: if draw exists but prediction is PENDING, verify NOW ──
    try {
      const pendingToVerify = predictions.filter((p) => {
        const st = (p.status || "").toUpperCase()
        return st !== "WON" && st !== "LOST" && st !== "NEAR_MISS"
      })
      if (pendingToVerify.length > 0) {
        const verifyKeys = new Set<string>()
        for (const p of pendingToVerify) {
          const d = (p.date || "").trim()
          const t = (p.turno || "").trim()
          if (d && t) verifyKeys.add(`${d}|${t}`)
        }
        for (const key of verifyKeys) {
          const [vDate, vTurno] = key.split("|")
          // Only verify if draw exists
          const { data: drawCheck } = await supabase
            .from("draws")
            .select("id")
            .eq("date", vDate)
            .eq("turno", vTurno)
            .limit(1)
          if (drawCheck && drawCheck.length > 0) {
            try {
              await supabase.schema("api").rpc("verify_predictions_for_draw" as never, {
                p_date: vDate, p_turno: vTurno,
              } as never)
            } catch { /* non-fatal */ }
          }
        }
        // Re-fetch predictions after inline verification
        const { data: refreshed } = await supabase
          .from("user_predictions")
          .select("id,date,turno,numeros,created_at,status,aciertos,verified_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(50)
        if (refreshed && refreshed.length > 0) {
          predictions = refreshed
        }
      }
    } catch (e) {
      logger.warn("mis-predicciones: inline verify failed", { error: String(e) })
    }

    const drawsMap: Record<string, DrawRow> = {}
    if (uniqueDates.length > 0) {
      const { data: draws } = await supabase
        .from("draws")
        .select("numbers,turno,date")
        .in("date", uniqueDates)
        .limit(200)

      if (draws) {
        for (const d of draws) {
          // Normalize date to YYYY-MM-DD (handles timestamptz format)
          const dateStr = String(d.date || "").split("T")[0]
          const key = `${dateStr}|${(d.turno || "").toLowerCase()}`
          if (d.numbers && Array.isArray(d.numbers) && d.numbers.length >= 5) {
            drawsMap[key] = d
          }
        }
      }
    }

    const predIds = predictions.map((p) => p.id).filter(Boolean)
    const historyMap: Record<string, PredictionHistoryRow> = {}
    if (predIds.length > 0) {
      const { data: history } = await supabase
        .from("prediction_history")
        .select("prediction_id,aciertos_2,aciertos_3,aciertos_4,total_aciertos,resultado_oficial")
        .in("prediction_id", predIds)
        .limit(200)

      if (history) {
        for (const h of history) {
          if (h.prediction_id) historyMap[h.prediction_id] = h
        }
      }
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

      // status del servidor (RPC / verificadores): define que el sorteo ya se
      // resolvió (hasResult) y se expone al cliente, pero NO decide "hubo
      // coincidencias" — eso lo decide allAciertos (ver nota más abajo).
      const statusUpper = (pred.status || '').toUpperCase()
      const serverVerified = statusUpper === 'WON' || statusUpper === 'LOST' || statusUpper === 'NEAR_MISS'

      // Cálculo puro de aciertos → lib/verificacion/api-aciertos.ts
      // (1) historial = criterio unificado; (2) sin historial = picks × sorteo.
      // NO se lee user_predictions.aciertos: esa columna es mixta (posiciones,
      // 0 placeholder del ±1 de NEAR_MISS, centinelas 3/4/5 de 3C/4C/redoblona
      // y conteo 5-8 en Poceada) — ver nota en api-aciertos.ts.
      const calc = calcularAciertosApi({
        numeros: pred.numeros,
        premium: tier.canAccessPremiumFeatures,
        historial: history,
        numerosSorteo: draw?.numbers && Array.isArray(draw.numbers) ? draw.numbers : null,
        // Poceada = juego SOLO de 2 cifras (00-99), distinto de Quiniela.
        esPoceada: turnoLower === "poceada",
      })
      const pred2 = calc.numeros_2
      const pred3 = calc.numeros_3
      const pred4 = calc.numeros_4
      const aciertos = calc.aciertos_2
      const aciertos3 = calc.aciertos_3
      const aciertos4 = calc.aciertos_4
      const numerosReales = calc.resultado_2
      const numerosReales3 = calc.resultado_3
      const numerosReales4 = calc.resultado_4
      const allAciertos = calc.todos

      const hasResult = serverVerified || !!history || disponible

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
        // "acerto" = hubo al menos una coincidencia (2/3/4 cifras), el mismo
        // criterio del resumen (misSummary) y del resto de las fuentes
        // (historial, cálculo y localStorage). ANTES: para filas verificadas
        // valía `status === 'WON'` → una predicción LOST/NEAR_MISS con
        // aciertos reales se mostraba "Sin coincidencias" mientras el cuerpo
        // de la tarjeta listaba "🎉 NN → Puesto X".
        acerto: hasResult ? allAciertos.length > 0 : false,
        // Estado de la verificación (WON = acertó la cabeza / NEAR_MISS = ±1 /
        // LOST), para que la UI lo muestre aparte de las coincidencias.
        status: serverVerified ? statusUpper : null,
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
    return NextResponse.json({ predictions: [], error: "Error cargando predicciones" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

  // Rate limit: 10 saves per minute per IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  const rlKey = `mis-predicciones:${ip}`
  const now = Date.now()
  const rlEntry = rateLimitMap.get(rlKey)
  if (rlEntry && now - rlEntry.windowStart < 60_000) {
    if (rlEntry.count >= 10) {
      return NextResponse.json({ error: "Demasiadas solicitudes. Esperá un minuto." }, { status: 429 })
    }
    rlEntry.count++
  } else {
    rateLimitMap.set(rlKey, { count: 1, windowStart: now })
  }

  const { getSupabaseAdmin } = await import("@/lib/supabase-client")

  try {
    const tier = await resolveUserTier(token)
    if (!tier.userId) return NextResponse.json({ error: "No autorizado" }, { status: 401 })

    // Expired trial users can still save in limited free mode (2 cifras only)
    // No 403 for expired trial — they fall back to free tier behavior

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

    // Validate date format (YYYY-MM-DD)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "Formato de fecha inválido" }, { status: 400 })
    }

    // Validate turno
    const VALID_TURNOS = ["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"]
    const turnoCanonical = turno.charAt(0).toUpperCase() + turno.slice(1).toLowerCase()
    if (!VALID_TURNOS.includes(turnoCanonical)) {
      return NextResponse.json({ error: "Turno inválido" }, { status: 400 })
    }

    // Validate numeros are numeric and within range
    const validateNums = (arr: unknown[], maxLen: number, maxVal: number): boolean => {
      if (!Array.isArray(arr) || arr.length === 0 || arr.length > maxLen) return false
      return arr.every((n: unknown) => {
        const v = Number(n)
        return !isNaN(v) && v >= 0 && v <= maxVal && String(n).trim().length > 0
      })
    }
    const numsArr = Array.isArray(numeros) ? numeros : null
    const numsObj = !numsArr && typeof numeros === "object" ? numeros : null
    // Poceada: SOLO 8 números de 2 cifras (00-99), guardados como array plano.
    // Es un juego distinto de la Quiniela (no existe 3/4 cifras ni redoblona).
    // ANTES la validación solo corría si llegaba un array → un objeto
    // {2,3,4,r} la esquivía y se guardaba con claves "3"/"4", lo que hacía
    // que la UI mostrara "3 CIFRAS"/"4 CIFRAS" para Poceada.
    if (turnoCanonical === "Poceada") {
      const arr = Array.isArray(numeros)
        ? numeros
        : (numeros && typeof numeros === "object"
            ? ((numeros as Record<string, unknown>)["2"] || (numeros as Record<string, unknown>)["numeros_2"]) || []
            : [])
      if (!Array.isArray(arr) || arr.length !== 8 || !validateNums(arr, 8, 99)) {
        return NextResponse.json({ error: "Poceada requiere exactamente 8 números de 2 cifras (00-99)" }, { status: 400 })
      }
    }

    if (numsArr && !validateNums(numsArr, 20, 99)) {
      return NextResponse.json({ error: "Números inválidos" }, { status: 400 })
    }
    if (numsObj) {
      const n2 = numsObj?.["2"] || numsObj?.numeros_2
      if (n2 && n2.length > 0 && !validateNums(n2, 20, 99)) {
        return NextResponse.json({ error: "Números 2 cifras inválidos" }, { status: 400 })
      }
      const n3 = numsObj?.["3"] || numsObj?.numeros_3
      if (n3 && n3.length > 0 && !validateNums(n3, 20, 999)) {
        return NextResponse.json({ error: "Números 3 cifras inválidos" }, { status: 400 })
      }
      const n4 = numsObj?.["4"] || numsObj?.numeros_4
      if (n4 && n4.length > 0 && !validateNums(n4, 20, 9999)) {
        return NextResponse.json({ error: "Números 4 cifras inválidos" }, { status: 400 })
      }
    }

    let numerosToStore: string[]
    if (turnoCanonical === "Poceada") {
      // Poceada SIEMPRE se guarda como array plano de 8 cifras 2 (00-99),
      // aunque el cliente mande un objeto {2,3,4,r} — en Poceada no existen
      // 3/4 cifras ni redoblona.
      const arr = Array.isArray(numeros)
        ? numeros
        : (numeros && typeof numeros === "object"
            ? ((numeros as Record<string, unknown>)["2"] || (numeros as Record<string, unknown>)["numeros_2"]) || []
            : [])
      numerosToStore = (arr as unknown[]).map((n: unknown) => String(n).padStart(2, "0"))
    } else if (tier.canAccessPremiumFeatures) {
      if (Array.isArray(numeros)) {
        numerosToStore = numeros.map((n: unknown) => String(n).padStart(2, '0'))
      } else if (numeros && typeof numeros === "object") {
        const nums2 = (numeros?.["2"] || numeros?.numeros_2 || []).map((n: unknown) => String(n).padStart(2, '0'))
        const nums3 = (numeros?.["3"] || numeros?.numeros_3 || []).map((n: unknown) => String(n).padStart(3, '0'))
        const nums4 = (numeros?.["4"] || numeros?.numeros_4 || []).map((n: unknown) => String(n).padStart(4, '0'))
        const rblRaw = numeros?.["r"]
        const rbl = Array.isArray(rblRaw) ? (rblRaw[0] || null) : (rblRaw || null)
        numerosToStore = [JSON.stringify({ "2": nums2, "3": nums3, "4": nums4, "r": rbl })]
      } else {
        numerosToStore = []
      }
    } else {
      const only2 = Array.isArray(numeros)
        ? numeros
        : (numeros?.["2"] || numeros?.numeros_2 || [])
      numerosToStore = only2.map((n: unknown) => String(n).padStart(2, '0'))
    }

    const supabase = getSupabaseAdmin()

    // Check for existing prediction
    const { data: existing } = await supabase
      .from("user_predictions")
      .select("id")
      .eq("user_id", userId)
      .eq("date", date)
      .eq("turno", turno)
      .limit(1)
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: "Ya guardaste un análisis para este turno", duplicate: true }, { status: 409 })
    }

    // Insert prediction
    const { data: inserted, error: insertErr } = await supabase
      .from("user_predictions")
      .insert({
        user_id: userId,
        date,
        turno,
        numeros: numerosToStore,
        game_id: GAME_ID,
      })
      .select()
      .single()

    if (insertErr) {
      if (insertErr.code === "23505") {
        return NextResponse.json({ error: "Ya guardaste un análisis para este turno", duplicate: true }, { status: 409 })
      }
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Trigger auto-verification ONLY if official result exists AND was created after the official turno time
    // This prevents premature verification when the scraper picks up results early
    try {
      const TURNO_TIMES_UTC: Record<string, string> = {
        Previa: "13:15", Primera: "15:00", Matutina: "18:00", Vespertina: "21:00", Nocturna: "00:00",
      }
      const now = new Date()
      const todayART = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
      const todayStr = todayART.toISOString().split("T")[0]
      // Only apply time guard for today's draws — future dates are always safe
      if (date === todayStr) {
        const officialTimeUTC = TURNO_TIMES_UTC[turno]
        if (officialTimeUTC) {
          const [h, m] = officialTimeUTC.split(":").map(Number)
          const officialDate = new Date(`${date}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00Z`)
          if (turno === "Nocturna") officialDate.setUTCDate(officialDate.getUTCDate() + 1)
          if (now.getTime() < officialDate.getTime() + 5 * 60 * 1000) {
            return NextResponse.json({
              ok: true,
              prediction: inserted,
              predictionsRemaining: tier.isPremium ? -1 : Math.max(0, FREE_MAX_PREDICTIONS - tier.predictionsUsed - 1),
            })
          }
        }
      }

      const { data: draws } = await supabase
        .from("draws")
        .select("id")
        .eq("date", date)
        .eq("turno", turno)
        .limit(1)
      if (draws && draws.length > 0) {
        const { autoVerifyPredictions } = await import("@/lib/verificacion/auto-verify")
        await autoVerifyPredictions(date, turno)
      }
    } catch { /* noop - verification is best effort */ }

    return NextResponse.json({
      ok: true,
      prediction: inserted,
      predictionsRemaining: tier.isPremium ? -1 : Math.max(0, FREE_MAX_PREDICTIONS - tier.predictionsUsed - 1),
    })
  } catch (e) {
    logger.error("[mis-predicciones] POST error:", { error: String(e) })
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 })
  }
}
