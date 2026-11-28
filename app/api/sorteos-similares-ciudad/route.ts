/**
 * POST /api/sorteos-similares-ciudad
 *
 * Búsqueda semántica de sorteos similares usando pgvector.
 * Cuerpo: { fuente: "quiniela-ciudad", fecha: "YYYY-MM-DD", turno: "Nocturna"|null, numeros: [..] }
 *
 * Genera un embedding del sorteo consulta y busca los más similares en la tabla sorteos_embeddings.
 */
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-client"
import { generarEmbeddingSorteo, sorteoATexto } from "@/lib/prediccion/vector-busqueda"
import logger from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 30

type FuenteSorteo = "quiniela-ciudad"

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limite = Math.min(20, Math.max(1, Number.parseInt(searchParams.get("limite") || "10", 10) || 10))

  let body: { fuente?: FuenteSorteo; fecha?: string; turno?: string | null; numeros?: number[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 })
  }

  const { fuente, fecha, turno, numeros } = body

  if (!fuente || !fecha || !numeros || !Array.isArray(numeros)) {
    return NextResponse.json(
      { ok: false, error: "Se requieren: fuente, fecha, numeros" },
      { status: 400 }
    )
  }

  const sb = getSupabaseAdmin()

  try {
    // ── 1. Generar embedding del sorteo consulta ──
    const texto = sorteoATexto(fuente, fecha, turno ?? null, numeros)
    const vector = await generarEmbeddingSorteo(texto)

    let resultados: Array<{
      fuente: string
      fecha: string
      turno: string | null
      numeros: number[]
      similitud: number
      texto: string
    }> = []

    if (vector) {
      // ── 2. Buscar sorteos similares con pgvector ──
      const { data, error } = await sb.rpc("buscar_sorteos_similares", {
        p_embedding: vector,
        p_fuente: fuente,
        p_turno: turno ?? null,
        p_limite: limite,
      })

      if (!error && data) {
        resultados = (data as Array<{
          fuente: string
          fecha: string
          turno: string | null
          numeros: number[]
          similitud: number
          metadata: { texto?: string }
        }>).map((r) => ({
          fuente: r.fuente,
          fecha: r.fecha,
          turno: r.turno,
          numeros: r.numeros,
          similitud: Math.round(r.similitud * 10000) / 10000,
          texto: r.metadata?.texto ?? "",
        }))
      }
    } else {
      // ── 3. Fallback sin embeddings: búsqueda por coincidencia de números ──
      logger.warn("[sorteos-similares] sin embeddings, usando fallback numérico")
      const { data: fallback, error: errFb } = await sb
        .from("sorteos_embeddings")
        .select("fecha, turno, numeros_json, metadata")
        .eq("fuente", fuente)
        .limit(limite * 3)

      if (!errFb && fallback) {
        // Calcular similitud simple: intersección de números
        const consultaSet = new Set(numeros.map((n) => n % 100))
        const filas = fallback as Array<{
          fecha: string
          turno: string | null
          numeros_json: number[]
          metadata: { texto?: string }
        }>
        resultados = filas
          .map((r) => {
            const numsSet = new Set(r.numeros_json.map((n) => n % 100))
            const interseccion = [...consultaSet].filter((n) => numsSet.has(n)).length
            const union = new Set([...consultaSet, ...numsSet]).size
            const similitud = union > 0 ? interseccion / union : 0
            return {
              fuente,
              fecha: r.fecha,
              turno: r.turno,
              numeros: r.numeros_json,
              similitud: Math.round(similitud * 10000) / 10000,
              texto: r.metadata?.texto ?? "",
            }
          })
          .sort((a, b) => b.similitud - a.similitud)
          .slice(0, limite)
      }
    }

    return NextResponse.json({
      ok: true,
      fuente,
      fecha,
      turno,
      numerosConsulta: numeros,
      limite,
      resultados,
      metodo: vector ? "pgvector (Cloudflare Workers AI + bge-m3)" : "fallback numérico (intersección)",
      nota: "Sorteos similares históricamente. No predicción futura.",
    })
  } catch (e) {
    logger.error("[sorteos-similares] error interno", { error: String(e) })
    return NextResponse.json({ ok: false, error: "error interno" }, { status: 500 })
  }
}
