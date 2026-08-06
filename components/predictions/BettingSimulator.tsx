"use client"

import { useState, useMemo, useEffect, useRef, useCallback } from "react"
import { Lock, Shield, ChevronDown, TrendingUp, Banknote, Target, Trophy } from "lucide-react"

/* ─── Types ─────────────────────────────────────────────────── */

interface BetNumber {
  numero: string
  score: number
  rank: number
  significado?: string
  emoji?: string
}

interface CabezaBet {
  numero: string
  monto: number
  potentialReturn: number
}

interface DistBet {
  numero: string
  monto: number
  potentialReturn: number
  weight: number
}

interface BetSuggestion {
  type: string
  cifraType: "2" | "3" | "4"
  budget: number
  cabeza: CabezaBet
  distribucion: DistBet[]
  totalPotentialReturn: number
  roi: number
}

interface BettingSimulatorProps {
  predictions: BetNumber[]
  turno: string
  isPremium: boolean
  onPremiumClick: () => void
}

/* ─── Payout Rates (per $100 bet) ───────────────────────────── */

const PAYOUT_RATES: Record<string, number> = {
  "2cabeza": 700,
  "2numero": 350,
  "3cabeza": 5000,
  "3numero": 2500,
  "4cabeza": 35000,
  "4numero": 15000,
}

/* ─── Budget presets ─────────────────────────────────────────── */

const BUDGET_PRESETS = [500, 1000, 2000, 5000] as const

/* ─── Cifra type config ─────────────────────────────────────── */

interface CifraConfig {
  key: "2" | "3" | "4"
  label: string
  premium: boolean
}

const CIFRA_OPTIONS: CifraConfig[] = [
  { key: "2", label: "2 Cifras", premium: false },
  { key: "3", label: "3 Cifras", premium: true },
  { key: "4", label: "4 Cifras", premium: true },
]

/* ─── Helpers ────────────────────────────────────────────────── */

function calculateSuggestion(
  predictions: BetNumber[],
  totalBudget: number,
  cifraType: "2" | "3" | "4"
): BetSuggestion {
  const cabezaBudget = totalBudget * 0.5
  const distBudget = totalBudget * 0.5

  const cabeza = predictions[0]
  if (!cabeza) {
    return {
      type: `${cifraType} cifras`,
      cifraType,
      budget: totalBudget,
      cabeza: { numero: "00", monto: 0, potentialReturn: 0 },
      distribucion: [],
      totalPotentialReturn: 0,
      roi: 0,
    }
  }

  const cabezaRate = PAYOUT_RATES[`${cifraType}cabeza`]
  const numeroRate = PAYOUT_RATES[`${cifraType}numero`]

  const top10 = predictions.slice(0, 10)
  const totalScore = top10.reduce((sum, p) => sum + (p.score || 0.5), 0)

  const distribucion: DistBet[] = top10.map((p) => {
    const weight = (p.score || 0.5) / totalScore
    const monto = Math.round(distBudget * weight)
    return {
      numero: p.numero,
      monto,
      potentialReturn: Math.round((monto / 100) * numeroRate),
      weight,
    }
  })

  const cabezaReturn = Math.round((cabezaBudget / 100) * cabezaRate)
  const totalDistReturn = distribucion.reduce((sum, d) => sum + d.potentialReturn, 0)
  const totalPotentialReturn = cabezaReturn + totalDistReturn
  const roi = totalBudget > 0 ? Math.round(((totalPotentialReturn - totalBudget) / totalBudget) * 100) : 0

  return {
    type: `${cifraType} cifras`,
    cifraType,
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

/* ─── Count-Up Hook ─────────────────────────────────────────── */

function useCountUp(target: number, duration = 600): number {
  const [value, setValue] = useState(target)
  const prevRef = useRef(target)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const from = prevRef.current
    const to = target
    if (from === to) return

    const start = performance.now()
    const animate = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(from + (to - from) * eased))
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate)
      } else {
        prevRef.current = to
      }
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return value
}

/* ─── Sub-Components ────────────────────────────────────────── */

function CifraToggle({
  options,
  active,
  isPremium,
  onSelect,
  onPremiumClick,
}: {
  options: CifraConfig[]
  active: "2" | "3" | "4"
  isPremium: boolean
  onSelect: (key: "2" | "3" | "4") => void
  onPremiumClick: () => void
}) {
  return (
    <div className="flex gap-2">
      {options.map((opt) => {
        const locked = opt.premium && !isPremium
        const isActive = active === opt.key
        return (
          <button
            key={opt.key}
            onClick={() => {
              if (locked) {
                onPremiumClick()
                return
              }
              onSelect(opt.key)
            }}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl
              text-xs font-bold transition-all duration-200
              ${isActive
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-lg shadow-emerald-500/10"
                : locked
                  ? "bg-slate-800/60 text-gray-600 border border-slate-700/40 cursor-not-allowed"
                  : "bg-slate-800/60 text-gray-400 border border-slate-700/40 hover:bg-slate-700/60 hover:text-gray-300"
              }
            `}
          >
            {locked && <Lock className="w-3 h-3" />}
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}

function BudgetPills({
  presets,
  active,
  onSelect,
}: {
  presets: readonly number[]
  active: number
  onSelect: (b: number) => void
}) {
  return (
    <div className="flex gap-2">
      {presets.map((b) => (
        <button
          key={b}
          onClick={() => onSelect(b)}
          className={`
            flex-1 py-2 px-2 rounded-full text-xs font-bold transition-all duration-200
            ${active === b
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
              : "bg-slate-800/60 text-gray-500 border border-slate-700/40 hover:bg-slate-700/60 hover:text-gray-400"
            }
          `}
        >
          ${b.toLocaleString("es-AR")}
        </button>
      ))}
    </div>
  )
}

function HeroCabeza({
  suggestion,
  significado,
}: {
  suggestion: BetSuggestion
  significado: string
}) {
  const animatedReturn = useCountUp(suggestion.cabeza.potentialReturn)

  return (
    <div className="relative bg-gradient-to-br from-slate-800 via-slate-800 to-emerald-900/20 rounded-2xl border border-emerald-500/20 p-5 overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl" />

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-emerald-400" />
            <span className="text-[11px] font-bold text-emerald-400/80 uppercase tracking-wider">
              Apuesta Fuerte — A la cabeza
            </span>
          </div>
          <span className="text-[11px] font-mono text-gray-500">
            50% · ${suggestion.cabeza.monto.toLocaleString("es-AR")}
          </span>
        </div>

        <div className="flex items-end gap-4">
          <span className="text-5xl sm:text-6xl font-black text-white tracking-tighter leading-none">
            {suggestion.cabeza.numero}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-400 truncate mb-1">{significado}</p>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              <span className="text-lg sm:text-xl font-black text-emerald-400">
                ${animatedReturn.toLocaleString("es-AR")}
              </span>
            </div>
            <p className="text-[10px] text-gray-600 mt-0.5">ganancia potencial</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoverageGrid({
  distribucion,
  headBudget,
  showAll,
  onToggle,
}: {
  distribucion: DistBet[]
  headBudget: number
  showAll: boolean
  onToggle: () => void
}) {
  const visible = showAll ? distribucion : distribucion.slice(0, 3)
  const maxMonto = Math.max(...distribucion.map((d) => d.monto), 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-400" />
          <span className="text-[11px] font-bold text-blue-400/80 uppercase tracking-wider">
            Cobertura Inteligente
          </span>
        </div>
        <span className="text-[10px] text-gray-600">
          {distribucion.length} números · 50%
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {visible.map((d, i) => (
          <div
            key={d.numero}
            className="bg-slate-800/60 rounded-xl border border-slate-700/40 p-3 transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-gray-600 font-mono">#{i + 1}</span>
              <span className="text-sm font-black text-white">{d.numero}</span>
            </div>
            <div className="w-full bg-slate-700/50 rounded-full h-1.5 overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-500"
                style={{ width: `${(d.monto / maxMonto) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-gray-500 font-mono">
                ${d.monto.toLocaleString("es-AR")}
              </span>
              <span className="text-[10px] text-emerald-400/70 font-mono">
                ${d.potentialReturn.toLocaleString("es-AR")}
              </span>
            </div>
          </div>
        ))}
      </div>

      {distribucion.length > 3 && (
        <button
          onClick={onToggle}
          className="w-full mt-3 py-2 text-[11px] font-bold text-gray-500 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
        >
          {showAll ? "Ocultar" : "Ver distribución completa"}
          <ChevronDown
            className={`w-3.5 h-3.5 transition-transform duration-300 ${showAll ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </div>
  )
}

function FinancialSummary({
  suggestion,
}: {
  suggestion: BetSuggestion
}) {
  const animatedReturn = useCountUp(suggestion.totalPotentialReturn)
  const animatedRoi = useCountUp(suggestion.roi, 400)

  return (
    <div className="bg-slate-800/40 rounded-2xl border border-slate-700/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Banknote className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-wider">
          Resumen Financiero
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {/* Inversión */}
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-1">Inversión</p>
          <p className="text-sm font-black text-white">
            ${suggestion.budget.toLocaleString("es-AR")}
          </p>
        </div>

        {/* Retorno */}
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-1">Retorno Max</p>
          <p className="text-sm font-black text-emerald-400">
            ${animatedReturn.toLocaleString("es-AR")}
          </p>
        </div>

        {/* ROI */}
        <div className="text-center">
          <p className="text-[10px] text-gray-500 mb-1">ROI</p>
          <div className="flex items-center justify-center gap-1">
            <Trophy className={`w-3 h-3 ${animatedRoi > 0 ? "text-emerald-400" : "text-red-400"}`} />
            <p className={`text-sm font-black ${animatedRoi > 0 ? "text-emerald-400" : "text-red-400"}`}>
              {animatedRoi > 0 ? "+" : ""}{animatedRoi.toLocaleString("es-AR")}%
            </p>
          </div>
        </div>
      </div>

      <p className="text-[9px] text-gray-600 text-center mt-4 leading-relaxed">
        Simulación con fines de entretenimiento. Los sorteos son eventos aleatorios.
        Los pagos son estimados según cotizaciones históricas.
      </p>
    </div>
  )
}

/* ─── Main Component ────────────────────────────────────────── */

export default function BettingSimulator({
  predictions,
  turno,
  isPremium,
  onPremiumClick,
}: BettingSimulatorProps) {
  const [activeTab, setActiveTab] = useState<"2" | "3" | "4">("2")
  const [budget, setBudget] = useState(1000)
  const [showAllCoverage, setShowAllCoverage] = useState(false)

  // Reset expanded view when tab or budget changes
  const handleTabChange = useCallback((tab: "2" | "3" | "4") => {
    setActiveTab(tab)
    setShowAllCoverage(false)
  }, [])

  const handleBudgetChange = useCallback((b: number) => {
    setBudget(b)
    setShowAllCoverage(false)
  }, [])

  const suggestion = useMemo(() => {
    if (!predictions || predictions.length === 0) return null
    return calculateSuggestion(predictions, budget, activeTab)
  }, [predictions, budget, activeTab])

  if (!suggestion) return null

  const headSignificado = predictions[0]?.significado || `Número ${suggestion.cabeza.numero}`

  return (
    <div className="bg-slate-900/80 rounded-2xl border border-slate-800 overflow-hidden backdrop-blur-sm">
      {/* ── ZONA A: Panel de Control ───────────────────────── */}
      <div className="p-4 border-b border-slate-800/60 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">💰</span>
          <h3 className="text-sm font-bold text-white">Simulador de Apuestas</h3>
          {!isPremium && (
            <span className="ml-auto text-[9px] bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/20">
              FREE
            </span>
          )}
        </div>

        {/* Cifra type toggle */}
        <CifraToggle
          options={CIFRA_OPTIONS}
          active={activeTab}
          isPremium={isPremium}
          onSelect={handleTabChange}
          onPremiumClick={onPremiumClick}
        />

        {/* Budget pills */}
        <div>
          <label className="text-[10px] text-gray-500 block mb-1.5">Presupuesto simulado</label>
          <BudgetPills
            presets={BUDGET_PRESETS}
            active={budget}
            onSelect={handleBudgetChange}
          />
        </div>
      </div>

      {/* ── ZONA B + C: Content ────────────────────────────── */}
      <div className="p-4 space-y-4">
        {/* Hero Card */}
        <HeroCabeza suggestion={suggestion} significado={headSignificado} />

        {/* Coverage Grid */}
        {suggestion.distribucion.length > 0 && (
          <CoverageGrid
            distribucion={suggestion.distribucion}
            headBudget={suggestion.cabeza.monto}
            showAll={showAllCoverage}
            onToggle={() => setShowAllCoverage(!showAllCoverage)}
          />
        )}
      </div>

      {/* ── ZONA D: Financial Summary ──────────────────────── */}
      <div className="px-4 pb-4">
        <FinancialSummary suggestion={suggestion} />
      </div>
    </div>
  )
}
