import fs from "fs"
import path from "path"

export interface ModeloExportado {
  modelo: string
  fecha_exportacion: string
  scores_por_numero: Record<string, number>
  top_10: { numero: string; score: number }[]
  metadata: Record<string, any>
}

const MODELOS_DIR = path.join(process.cwd(), "modelos_exportados")

const cache = new Map<string, { data: ModeloExportado; timestamp: number }>()
const CACHE_TTL = 10 * 60 * 1000

export function cargarModeloPython(turno: string, tipo: "xgboost" | "random_forest"): ModeloExportado | null {
  const key = `${tipo}_${turno}`
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) return cached.data

  try {
    const filePath = path.join(MODELOS_DIR, `${tipo}_${turno}_prediccion.json`)
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, "utf-8")
    const data = JSON.parse(raw) as ModeloExportado
    cache.set(key, { data, timestamp: Date.now() })
    return data
  } catch {
    return null
  }
}

export function obtenerBoostPython(turno: string, tipo: "xgboost" | "random_forest" = "xgboost"): Record<number, number> | null {
  const modelo = cargarModeloPython(turno, tipo)
  if (!modelo) return null
  const boost: Record<number, number> = {}
  for (const [numStr, score] of Object.entries(modelo.scores_por_numero)) {
    boost[parseInt(numStr)] = score
  }
  return boost
}

export function getModelosExportadosDisponibles(): { tipo: string; turno: string; fecha: string }[] {
  try {
    if (!fs.existsSync(MODELOS_DIR)) return []
    const files = fs.readdirSync(MODELOS_DIR).filter(f => f.endsWith("_prediccion.json"))
    return files.map(f => {
      const parts = f.replace("_prediccion.json", "").split("_")
      const tipo = parts[0]
      const turno = parts.slice(1).join("_")
      try {
        const raw = fs.readFileSync(path.join(MODELOS_DIR, f), "utf-8")
        const data = JSON.parse(raw)
        return { tipo, turno, fecha: data.fecha_exportacion || "" }
      } catch {
        return { tipo, turno, fecha: "" }
      }
    })
  } catch {
    return []
  }
}

export function limpiarCacheModelos(): void {
  cache.clear()
}