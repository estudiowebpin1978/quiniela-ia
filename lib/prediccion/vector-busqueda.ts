/**
 * Búsqueda semántica de sorteos similares
 *
 * Usa pgvector en Supabase para encontrar sorteos históricos similares
 * a uno dado, basado en embeddings generados con Cloudflare Workers AI
 * o modelo local (sentence-transformers / bge-m3).
 *
 * Solo para Quiniela Ciudad.
 */

import { getSupabase } from "@/lib/supabase-client"
import logger from "@/lib/logger"

export type FuenteSorteo = "quiniela-ciudad"

interface SorteoSimilar {
  fuente: string
  fecha: string
  turno: string | null
  numeros: number[]
  similitud: number // 0-1, cuánto se parece al sorteo consulta
  metadata: Record<string, unknown>
}

/**
 * Genera un embedding para un sorteo usando Cloudflare Workers AI.
 * Requiere variables de entorno: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
 */
export async function generarEmbeddingSorteo(
  texto: string
): Promise<number[] | null> {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN

  if (!accountId || !apiToken) {
    logger.warn("[vector-busqueda] Faltan credenciales Cloudflare para embeddings")
    return null
  }

  try {
    const resp = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/baai/bge-m3`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: [texto] }),
        signal: AbortSignal.timeout(30000),
      }
    )

    if (!resp.ok) {
      logger.warn("[vector-busqueda] Error Workers AI", { status: resp.status })
      return null
    }

    const data = (await resp.json()) as { result?: { data?: number[][] } }
    const vector = data?.result?.data?.[0]
    return Array.isArray(vector) ? vector : null
  } catch (e) {
    logger.warn("[vector-busqueda] Fallo generando embedding", { error: String(e) })
    return null
  }
}

/**
 * Convierte un sorteo en texto para generar su embedding.
 */
export function sorteoATexto(
  fuente: FuenteSorteo,
  fecha: string,
  turno: string | null,
  numeros: number[]
): string {
  const numsStr = numeros.map(String).join(", ")
  return `Quiniela Ciudad - Turno ${turno} - Fecha ${fecha} - Números: ${numsStr}`
}

/**
 * Busca sorteos similares en Supabase usando pgvector (búsqueda por coseno).
 */
export async function buscarSorteosSimilares(
  vectorConsulta: number[],
  fuente: FuenteSorteo,
  turno: string | null,
  limite = 10
): Promise<SorteoSimilar[]> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .rpc("buscar_sorteos_similares", {
      p_embedding: vectorConsulta,
      p_fuente: fuente,
      p_turno: turno,
      p_limite: limite,
    })

  if (error) {
    logger.warn("[vector-busqueda] RPC buscar_sorteos_similares no disponible", {
      error: error.message,
    })
    return []
  }

  return (data ?? []) as unknown as SorteoSimilar[]
}

/**
 * Inserta un embedding de sorteo en la tabla.
 */
export async function insertarEmbeddingSorteo(
  fuente: FuenteSorteo,
  fecha: string,
  turno: string | null,
  numeros: number[],
  vector: number[],
  metadata: Record<string, unknown> = {}
): Promise<void> {
  const supabase = getSupabase()
  const texto = sorteoATexto(fuente, fecha, turno, numeros)

  const { error } = await supabase
    .from("sorteos_embeddings")
    .upsert(
      {
        fuente,
        fecha,
        turno,
        numeros_json: numeros,
        embedding: vector,
        metadata: { texto, ...metadata },
      },
      { onConflict: "fuente,fecha,turno" }
    )

  if (error) {
    logger.error("[vector-busqueda] error insertando embedding", { error, fecha, fuente })
  }
}
