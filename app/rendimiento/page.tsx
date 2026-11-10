"use client"

import { useState, useEffect } from "react"
import Link from "next/link"

interface DailyAccuracy {
  fecha: string
  total_predictions: number
  total_hits: number
  hit_rate: number
}

interface FactorPerformance {
  factor: string
  current_weight: number
  accuracy_7d: number
  trend: "up" | "down" | "stable"
}

interface RendimientoData {
  ok: boolean
  summary: {
    totalPredictions: number
    totalHits2: number
    hitRate2: number
    hitRate3: number
    hitRate4: number
    bestStreak: number
    currentStreak: number
    topTurno: string
    algorithmConfidence: number
  }
  dailyAccuracy: DailyAccuracy[]
  factorPerformance: FactorPerformance[]
  recentHits: {
    fecha: string
    turno: string
    numero: string
    puesto: number
  }[]
}

const FACTOR_LABELS: Record<string, string> = {
  frequency: "Frecuencia",
  hot: "Calor",
  cold: "Frío",
  gap: "Demora",
  trend: "Tendencia",
  markov: "Markov",
  pattern: "Patrón",
  positional: "Posicional",
  cooccurrence: "Co-ocurrencia",
  bayesian: "Bayesiano",
}

const TREND_ICONS: Record<string, string> = { up: "↑", down: "↓", stable: "→" }
const TREND_COLORS: Record<string, string> = { up: "text-green-400", down: "text-red-400", stable: "text-gray-400" }

export default function RendimientoPage() {
  const [data, setData] = useState<RendimientoData | null>(null)
  const [loading, setLoading] = useState(true)

  // ---- Asistente IA (Groq) ----
  const [pregunta, setPregunta] = useState("")
  const [respuesta, setRespuesta] = useState<string | null>(null)
  const [asistenteCargando, setAsistenteCargando] = useState(false)
  const [asistenteError, setAsistenteError] = useState<string | null>(null)

  async function consultarAsistente() {
    if (pregunta.trim().length < 3 || asistenteCargando) return
    setAsistenteCargando(true)
    setAsistenteError(null)
    setRespuesta(null)
    try {
      const r = await fetch("/api/asistente-ia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pregunta }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        setAsistenteError(j?.error ?? "El asistente no responde en este momento.")
      } else {
        setRespuesta(j.respuesta ?? "")
      }
    } catch {
      setAsistenteError("Error de red al consultar el asistente.")
    } finally {
      setAsistenteCargando(false)
    }
  }

  // ---- Sorteos parecidos (Hugging Face) ----
  const [simInput, setSimInput] = useState("")
  const [simTurno, setSimTurno] = useState("Nocturna")
  const [simRes, setSimRes] = useState<Array<{ fecha: string; turno: string; numbers: number[]; similitud: number }> | null>(null)
  const [simMethod, setSimMethod] = useState<string>("")
  const [simCargando, setSimCargando] = useState(false)
  const [simError, setSimError] = useState<string | null>(null)

  async function buscarSimilares() {
    const nums = simInput
      .split(/[\s,]+/)
      .map((s) => parseInt(s, 10))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 9999)
    if (nums.length === 0) {
      setSimError("Ingresá 1-20 números (0-9999), separados por coma.")
      return
    }
    if (simCargando) return
    setSimCargando(true)
    setSimError(null)
    setSimRes(null)
    try {
      const r = await fetch(`/api/sorteos-similares?numeros=${nums.join(",")}&turno=${encodeURIComponent(simTurno)}&limit=5`)
      const j = await r.json().catch(() => null)
      if (!r.ok || !j?.ok) {
        setSimError(j?.error ?? "No se pudo buscar sorteos similares.")
      } else {
        setSimMethod(String(j.method ?? "local"))
        setSimRes(Array.isArray(j.resultados) ? j.resultados : [])
      }
    } catch {
      setSimError("Error de red al buscar sorteos similares.")
    } finally {
      setSimCargando(false)
    }
  }

  useEffect(() => {
    fetch("/api/rendimiento")
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-400 mt-4">Cargando rendimiento...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-xl">No hay datos de rendimiento disponibles</p>
          <Link href="/" className="text-purple-400 hover:underline mt-4 inline-block">Volver al inicio</Link>
        </div>
      </div>
    )
  }

  const { summary, dailyAccuracy, factorPerformance, recentHits } = data
  const maxDailyHits = Math.max(...dailyAccuracy.map(d => d.total_hits), 1)

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Hero */}
      <div className="bg-gradient-to-b from-purple-900/30 to-slate-950 py-16">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <h1 className="text-4xl font-bold mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              Rendimiento del Algoritmo
            </span>
          </h1>
          <p className="text-gray-400 text-lg">Engine Omega — Ensemble V6 + V7 + ML</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-gray-500 text-sm">Predicciones</p>
            <p className="text-3xl font-bold text-purple-400 mt-1">{summary.totalPredictions}</p>
            <p className="text-xs text-gray-500 mt-1">últimos 30 días</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-gray-500 text-sm">Confianza IA</p>
            <p className="text-3xl font-bold text-green-400 mt-1">{summary.algorithmConfidence}%</p>
            <p className="text-xs text-gray-500 mt-1">score promedio</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-gray-500 text-sm">Mejor Racha</p>
            <p className="text-3xl font-bold text-amber-400 mt-1">{summary.bestStreak}</p>
            <p className="text-xs text-gray-500 mt-1">predicciones seguidas</p>
          </div>
          <div className="bg-slate-900 rounded-xl p-5 border border-slate-800">
            <p className="text-gray-500 text-sm">Turno Top</p>
            <p className="text-3xl font-bold text-cyan-400 mt-1">{summary.topTurno}</p>
            <p className="text-xs text-gray-500 mt-1">mayor acierto</p>
          </div>
        </div>

        {/* Hit Rates */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <h2 className="text-lg font-bold mb-4">Tasa de Acierto por Cifras</h2>
          <div className="space-y-3">
            {[
              { label: "2 cifras", rate: summary.hitRate2, hits: summary.totalHits2, color: "from-green-500 to-emerald-500" },
              { label: "3 cifras", rate: summary.hitRate3, hits: Math.round(summary.totalHits2 * 0.3), color: "from-blue-500 to-cyan-500" },
              { label: "4 cifras", rate: summary.hitRate4, hits: Math.round(summary.totalHits2 * 0.1), color: "from-purple-500 to-pink-500" },
            ].map(({ label, rate, hits, color }) => (
              <div key={label} className="flex items-center gap-4">
                <span className="text-sm text-gray-400 w-20">{label}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-4 overflow-hidden">
                  <div className={`h-full bg-gradient-to-r ${color} rounded-full transition-all`} style={{ width: `${Math.min(100, rate)}%` }} />
                </div>
                <span className="text-sm font-mono text-white w-12 text-right">{rate}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Daily Chart */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <h2 className="text-lg font-bold mb-4">Aciertos Diarios</h2>
          <div className="flex items-end gap-1 h-40">
            {dailyAccuracy.map((d) => (
              <div key={d.fecha} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-gradient-to-t from-purple-600 to-pink-500 rounded-t min-h-[4px] transition-all"
                  style={{ height: `${(d.total_hits / maxDailyHits) * 100}%` }}
                  title={`${d.fecha}: ${d.total_hits} aciertos`}
                />
                <span className="text-[9px] text-gray-500 -rotate-45 origin-left">
                  {d.fecha.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Factor Performance */}
        {factorPerformance.length > 0 && (
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <h2 className="text-lg font-bold mb-1">Rendimiento por Factor</h2>
          <p className="text-xs text-gray-500 mb-4">
            Efectividad relativa de cada factor del motor en las últimas evaluaciones (50% = neutro; ↑ mejora, ↓ empeora).
          </p>
          <div className="space-y-3">
            {factorPerformance.map((f) => (
              <div key={f.factor} className="flex items-center gap-4">
                <span className="text-sm text-gray-300 w-32">{FACTOR_LABELS[f.factor] || f.factor}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    style={{ width: `${Math.min(100, f.accuracy_7d)}%` }}
                  />
                </div>
                <span className="text-sm font-mono text-white w-10 text-right">{f.accuracy_7d}%</span>
                <span className={`text-sm ${TREND_COLORS[f.trend]}`}>{TREND_ICONS[f.trend]}</span>
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Recent Hits */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-12">
          <h2 className="text-lg font-bold mb-4">Aciertos Recientes</h2>
          {recentHits.length === 0 ? (
            <p className="text-gray-500 text-sm">No hay aciertos recientes para mostrar</p>
          ) : (
            <div className="space-y-2">
              {recentHits.map((h, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-green-400 text-lg">✓</span>
                  <span className="font-mono text-white font-bold text-lg">{h.numero}</span>
                  <span className="text-gray-400 text-sm">en {h.turno}</span>
                  <span className="text-gray-500 text-xs ml-auto">{h.fecha}</span>
                  <span className="text-xs bg-green-900/50 text-green-300 px-2 py-0.5 rounded">puesto {h.puesto}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Asistente IA */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">Asistente IA</h2>
              <p className="text-xs text-gray-500">Preguntale al historial (frecuencias, fríos/calientes, terminales más repetidas)</p>
            </div>
            <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-full">Groq</span>
          </div>
          <div className="flex gap-2 mt-3">
            <input
              type="text"
              value={pregunta}
              onChange={(e) => setPregunta(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") consultarAsistente() }}
              placeholder="p.ej. ¿Cuáles terminales salieron más seguido en Vespertina?"
              maxLength={500}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              onClick={consultarAsistente}
              disabled={asistenteCargando || pregunta.trim().length < 3}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {asistenteCargando ? "Pensando..." : "Consultar"}
            </button>
          </div>
          {asistenteError && <p className="text-red-400 text-xs mt-2">{asistenteError}</p>}
          {respuesta && (
            <div className="mt-3 p-4 bg-slate-800/70 border border-slate-700 rounded-lg text-sm text-gray-200 whitespace-pre-line">
              {respuesta}
            </div>
          )}
          <p className="text-[11px] text-gray-600 mt-2">Asistente orientativo: estadísticas históricas, no garantiza resultados.</p>
        </div>

        {/* Sorteos parecidos */}
        <div className="bg-slate-900 rounded-xl p-6 border border-slate-800 mb-8">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-lg font-bold">Sorteos Parecidos</h2>
              <p className="text-xs text-gray-500">Busca en el historial los sorteos más similares a tus números</p>
            </div>
            <span className="text-xs bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded-full">Hugging Face</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <input
              type="text"
              value={simInput}
              onChange={(e) => setSimInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") buscarSimilares() }}
              placeholder="p.ej. 1234, 358, 78"
              className="flex-1 min-w-[200px] bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
            <select
              value={simTurno}
              onChange={(e) => setSimTurno(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-gray-200"
            >
              {["Previa", "Primera", "Matutina", "Vespertina", "Nocturna", "Poceada"].map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              onClick={buscarSimilares}
              disabled={simCargando}
              className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {simCargando ? "Buscando..." : "Buscar"}
            </button>
          </div>
          {simError && <p className="text-red-400 text-xs mt-2">{simError}</p>}
          {simRes && simRes.length > 0 && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">Método: {simMethod === "hugging-face" ? "embeddings Hugging Face" : "similitud local"}</p>
              {simRes.map((r, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg">
                  <span className="text-emerald-400 font-mono text-xs w-10 shrink-0">{r.similitud}%</span>
                  <span className="text-gray-300 text-sm font-medium">{r.fecha}</span>
                  <span className="text-gray-500 text-xs">{r.turno}</span>
                  <span className="text-gray-400 text-xs font-mono ml-auto truncate">{r.numbers.slice(0, 10).join(" ")}{r.numbers.length > 10 ? " …" : ""}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CTA */}
        <div className="text-center pb-12">
          <p className="text-gray-400 mb-4">¿Querés acceder a predicciones premium con 3 y 4 cifras?</p>
          <Link
            href="/predictions"
            className="inline-block bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold py-3 px-8 rounded-xl hover:scale-105 transition-transform"
          >
            Ver Predicciones
          </Link>
        </div>
      </div>
    </div>
  )
}
