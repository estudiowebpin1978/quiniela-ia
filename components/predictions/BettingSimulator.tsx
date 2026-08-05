"use client"

import { useState, useMemo } from "react"

interface BetNumber {
  numero: string
  score: number
  rank: number
  significado?: string
  emoji?: string
}

interface BetSuggestion {
  type: string
  budget: number
  cabeza: { numero: string; monto: number; potentialReturn: number }
  distribucion: { numero: string; monto: number; potentialReturn: number }[]
  totalPotentialReturn: number
  roi: number
}

interface BettingSimulatorProps {
  predictions: BetNumber[]
  turno: string
}

// Quiniela Nacional approximate payout rates (per $100 bet)
const PAYOUT_RATES: Record<string, number> = {
  "2cabeza": 700,    // $700 per $100 bet (7x)
  "2numero": 350,    // $350 per $100 bet (3.5x)
  "3cabeza": 5000,   // $5000 per $100 bet (50x)
  "3numero": 2500,   // $2500 per $100 bet (25x)
  "4cabeza": 35000,  // $35000 per $100 bet (350x)
  "4numero": 15000,  // $15000 per $100 bet (150x)
}

function calculateSuggestion(
  predictions: BetNumber[],
  totalBudget: number,
  cifraType: "2" | "3" | "4"
): BetSuggestion {
  const cabezaBudget = totalBudget * 0.5 // 50% a la cabeza
  const distBudget = totalBudget * 0.5   // 50% distribuido entre los 10

  const cabeza = predictions[0]
  const cabezaRate = PAYOUT_RATES[`${cifraType}cabeza`]
  const numeroRate = PAYOUT_RATES[`${cifraType}numero`]

  // Distribute remaining budget weighted by score
  const totalScore = predictions.slice(0, 10).reduce((sum, p) => sum + (p.score || 0.5), 0)
  const distribucion = predictions.slice(0, 10).map((p) => {
    const weight = (p.score || 0.5) / totalScore
    const monto = Math.round(distBudget * weight)
    return {
      numero: p.numero,
      monto,
      potentialReturn: Math.round((monto / 100) * numeroRate),
    }
  })

  const cabezaReturn = Math.round((cabezaBudget / 100) * cabezaRate)
  const totalDistReturn = distribucion.reduce((sum, d) => sum + d.potentialReturn, 0)
  const totalPotentialReturn = cabezaReturn + totalDistReturn
  const roi = Math.round(((totalPotentialReturn - totalBudget) / totalBudget) * 100)

  return {
    type: `${cifraType} cifras`,
    budget: totalBudget,
    cabeza: {
      numero: cabeza.numero,
      monto: cabezaBudget,
      potentialReturn: cabezaReturn,
    },
    distribucion,
    totalPotentialReturn,
    roi,
  }
}

export default function BettingSimulator({ predictions, turno }: BettingSimulatorProps) {
  const [activeTab, setActiveTab] = useState<"2" | "3" | "4">("2")
  const [budget, setBudget] = useState(1000)

  const suggestions = useMemo(() => {
    if (!predictions || predictions.length === 0) return null
    return {
      "2": calculateSuggestion(predictions, budget, "2"),
      "3": calculateSuggestion(predictions, budget, "3"),
      "4": calculateSuggestion(predictions, budget, "4"),
    }
  }, [predictions, budget])

  if (!suggestions) return null

  const active = suggestions[activeTab]

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">💰</span>
          <h3 className="text-sm font-bold text-white">Simulador de Apuestas</h3>
        </div>
        <p className="text-[10px] text-gray-500">
          Herramienta de entretenimiento. No garantiza resultados.
        </p>
      </div>

      {/* Budget selector */}
      <div className="px-4 py-3 border-b border-slate-800/50">
        <label className="text-[10px] text-gray-500 block mb-1">Presupuesto simulado</label>
        <div className="flex gap-2">
          {[500, 1000, 2000, 5000].map((b) => (
            <button
              key={b}
              onClick={() => setBudget(b)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                budget === b
                  ? "bg-purple-600 text-white"
                  : "bg-slate-800 text-gray-400 hover:bg-slate-700"
              }`}
            >
              ${b.toLocaleString("es-AR")}
            </button>
          ))}
        </div>
      </div>

      {/* Cifra tabs */}
      <div className="flex border-b border-slate-800/50">
        {(["2", "3", "4"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-xs font-bold transition-all ${
              activeTab === tab
                ? "text-white border-b-2 border-purple-500 bg-slate-800/50"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {tab} cifras
          </button>
        ))}
      </div>

      {/* Suggestion content */}
      <div className="p-4 space-y-3">
        {/* Cabeza */}
        <div className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 rounded-xl p-3 border border-amber-800/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">Cabeza (50%)</span>
            <span className="text-xs text-amber-300 font-mono">${active.cabeza.monto.toLocaleString("es-AR")}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black text-white">{active.cabeza.numero}</span>
            <div className="flex-1">
              <div className="text-[10px] text-gray-400">
                {predictions[0]?.significado || `Número ${active.cabeza.numero}`}
              </div>
              <div className="text-xs text-green-400 font-bold">
                Potencial: ${active.cabeza.potentialReturn.toLocaleString("es-AR")}
              </div>
            </div>
          </div>
        </div>

        {/* Distribución top 10 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Distribución (50% entre Top 10)
            </span>
          </div>
          <div className="space-y-1.5">
            {active.distribucion.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="text-gray-500 w-4 text-right">#{i + 1}</span>
                <span className="font-mono text-white font-bold w-7">{d.numero}</span>
                <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full"
                    style={{ width: `${(d.monto / (budget * 0.5)) * 100}%` }}
                  />
                </div>
                <span className="text-gray-400 w-12 text-right">${d.monto}</span>
                <span className="text-green-400/70 w-16 text-right">${d.potentialReturn.toLocaleString("es-AR")}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-slate-800/50 rounded-xl p-3 mt-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Inversión total</span>
            <span className="text-white font-bold">${active.budget.toLocaleString("es-AR")}</span>
          </div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-400">Retorno potencial</span>
            <span className="text-green-400 font-bold">${active.totalPotentialReturn.toLocaleString("es-AR")}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-gray-400">ROI potencial</span>
            <span className={`font-bold ${active.roi > 0 ? "text-green-400" : "text-red-400"}`}>
              {active.roi > 0 ? "+" : ""}{active.roi}%
            </span>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="text-center pt-2">
          <p className="text-[9px] text-gray-600 leading-tight">
            Simulación con fines de entretenimiento. Los sorteos son eventos aleatorios.
            Los pagos son estimados según cotizaciones históricas.
          </p>
        </div>
      </div>
    </div>
  )
}
