"use client";

import { useState, useCallback } from "react";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { Button3D } from "@/components/ui/button-3d";
import { NumberTile3D } from "@/components/ui/number-tile-3d";

interface NumberAnalysisResult {
  number: number;
  lastAppearance: {
    date: string;
    turno: string;
    daysAgo: number;
  } | null;
  frequency: {
    total: number;
    last30Days: number;
    last90Days: number;
  };
  calibrationIndex: number;
  hotColdStatus: "hot" | "cold" | "neutral";
  averageInterval: number;
  currentAbsence: number;
  historicalRank: number;
  verdict: string;
  verdictoColor: "emerald" | "amber" | "rose" | "cyan";
}

export function MiNumeroAnalyzer() {
  const [inputNumber, setInputNumber] = useState("");
  const [result, setResult] = useState<NumberAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const supabase = getSupabaseBrowser();

  const analyzeNumber = useCallback(async (num: number) => {
    setLoading(true);
    setError(null);

    try {
      const { data: draws, error: drawsError } = await supabase
        .from("draws")
        .select("date, turno, numbers")
        .order("date", { ascending: false })
        .limit(200);

      if (drawsError) throw drawsError;

      if (!draws || draws.length === 0) {
        throw new Error("No hay datos de sorteos disponibles");
      }

      let lastAppearance: NumberAnalysisResult["lastAppearance"] = null;
      let totalCount = 0;
      let last30Count = 0;
      let last90Count = 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const intervals: number[] = [];
      let lastDate: Date | null = null;

      for (const draw of draws) {
        if (!draw.numbers) continue;
        const drawDate = new Date(draw.date + "T00:00:00");
        const appears = draw.numbers.includes(num);

        if (appears) {
          totalCount++;
          if (drawDate >= thirtyDaysAgo) last30Count++;
          if (drawDate >= ninetyDaysAgo) last90Count++;

          if (!lastAppearance) {
            lastAppearance = {
              date: draw.date,
              turno: draw.turno,
              daysAgo: Math.floor(
                (new Date().getTime() - drawDate.getTime()) / (1000 * 60 * 60 * 24)
              ),
            };
          }

          if (lastDate) {
            const diff = Math.floor(
              (lastDate.getTime() - drawDate.getTime()) / (1000 * 60 * 60 * 24)
            );
            intervals.push(diff);
          }
          lastDate = drawDate;
        }
      }

      const currentAbsence = lastAppearance?.daysAgo ?? 999;
      const averageInterval =
        intervals.length > 0
          ? intervals.reduce((a, b) => a + b, 0) / intervals.length
          : 30;

      const calibrationIndex = Math.min(
        100,
        Math.round((currentAbsence / Math.max(averageInterval, 1)) * 100)
      );

      let hotColdStatus: "hot" | "cold" | "neutral" = "neutral";
      if (last30Count >= 4) hotColdStatus = "hot";
      else if (totalCount > 0 && currentAbsence > averageInterval * 1.5) hotColdStatus = "cold";

      const allNumbersFreq: Record<number, number> = {};
      draws.forEach((d) => {
        d.numbers?.forEach((n) => {
          allNumbersFreq[n] = (allNumbersFreq[n] || 0) + 1;
        });
      });
      const sortedNumbers = Object.entries(allNumbersFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([n]) => parseInt(n));
      const historicalRank = sortedNumbers.indexOf(num) + 1;

      let verdict = "";
      let verdictoColor: NumberAnalysisResult["verdictoColor"] = "cyan";

      if (hotColdStatus === "hot") {
        verdict = `El ${num.toString().padStart(2, "0")} está CALIENTE: salió ${last30Count} veces en los últimos 30 días.`;
        verdictoColor = "emerald";
      } else if (hotColdStatus === "cold") {
        verdict = `El ${num.toString().padStart(2, "0")} está FRÍO: no sale hace ${currentAbsence} días (promedio cada ${averageInterval.toFixed(0)} días).`;
        verdictoColor = "rose";
      } else {
        verdict = `El ${num.toString().padStart(2, "0")} está NEUTRAL: su comportamiento está dentro de parámetros estadísticos normales.`;
        verdictoColor = "amber";
      }

      const analysisResult: NumberAnalysisResult = {
        number: num,
        lastAppearance,
        frequency: {
          total: totalCount,
          last30Days: last30Count,
          last90Days: last90Count,
        },
        calibrationIndex,
        hotColdStatus,
        averageInterval: Math.round(averageInterval * 10) / 10,
        currentAbsence,
        historicalRank,
        verdict,
        verdictoColor,
      };

      setResult(analysisResult);
      setHistory((prev) => [num, ...prev.filter((n) => n !== num)].slice(0, 5));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al analizar el número");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(inputNumber, 10);
    if (!isNaN(num) && num >= 0 && num <= 99) {
      analyzeNumber(num);
    } else {
      setError("Ingresá un número válido entre 00 y 99");
    }
  };

  const handleQuickPick = (num: number) => {
    setInputNumber(num.toString().padStart(2, "0"));
    analyzeNumber(num);
  };

  const getStatusBadge = (status: "hot" | "cold" | "neutral") => {
    const styles = {
      hot: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
      cold: "bg-rose-500/20 text-rose-400 border-rose-500/30",
      neutral: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    };
    const labels = { hot: "🔥 CALIENTE", cold: "❄️ FRÍO", neutral: "⚪ NEUTRAL" };
    return (
      <span className={`badge-3d font-mono text-xs ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <section className="glass-panel-3d p-6" aria-labelledby="analyzer-title">
      <header className="mb-6">
        <h2
          id="analyzer-title"
          className="font-mono text-xl font-bold flex items-center gap-2"
        >
          <span className="text-emerald-400">🔍</span>
          Analizador de Mi Número
        </h2>
        <p className="text-slate-500 text-sm mt-1">
          Escribí tu número de la suerte y descubrí su estado estadístico real
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <label htmlFor="numero-input" className="sr-only">
              Tu número (00-99)
            </label>
            <input
              id="numero-input"
              type="text"
              maxLength={2}
              value={inputNumber}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 2);
                setInputNumber(val.padStart(2, "0"));
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit(e as unknown as React.FormEvent);
              }}
              placeholder="00"
              className="w-full h-14 glass-panel-3d border border-slate-700 rounded-xl px-4 py-3 font-mono text-2xl text-center text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-transparent"
              aria-label="Número a analizar (00-99)"
            />
          </div>
          <Button3D
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            className="whitespace-nowrap"
            disabled={loading}
          >
            Analizar
          </Button3D>
        </div>
      </form>

      {error && (
        <div className="mb-4 p-3 glass-panel-3d border border-rose-500/30 text-rose-400 text-sm rounded-xl" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <NumberTile3D
              number={result.number}
              size="xl"
              variant={result.hotColdStatus === "hot" ? "emerald" : result.hotColdStatus === "cold" ? "rose" : "amber"}
              className="shadow-[0_0_30px_rgba(16,185,129,0.3)]"
            />
            <div className="flex items-center gap-3">
              {getStatusBadge(result.hotColdStatus)}
              <span className="font-mono text-sm text-slate-400">
                Rank histórico: #{result.historicalRank}
              </span>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Última aparición"
              value={
                result.lastAppearance
                  ? `${result.lastAppearance.date} (${result.lastAppearance.turno})`
                  : "Nunca en el histórico"
              }
              sublabel={`${result.lastAppearance ? result.lastAppearance.daysAgo : "—"} días atrás`}
              icon="📅"
            />
            <StatCard
              label="Frecuencia (30 días)"
              value={result.frequency.last30Days.toString()}
              sublabel={`Total: ${result.frequency.total} | 90d: ${result.frequency.last90Days}`}
              icon="📊"
            />
            <StatCard
              label="Índice de Calibración"
              value={`${result.calibrationIndex}%`}
              sublabel={
                result.calibrationIndex > 100
                  ? "Muy atrasado"
                  : result.calibrationIndex > 80
                    ? "Atrasado"
                    : "Normal"
              }
              icon="⚖️"
              valueColor={
                result.calibrationIndex > 100
                  ? "text-rose-400"
                  : result.calibrationIndex > 80
                    ? "text-amber-400"
                    : "text-emerald-400"
              }
            />
            <StatCard
              label="Intervalo promedio"
              value={`${result.averageInterval} días`}
              sublabel={`Ausencia actual: ${result.currentAbsence} días`}
              icon="⏱️"
            />
          </div>

          <div
            className={`p-4 glass-panel-3d border-l-4 ${
              result.verdictoColor === "emerald"
                ? "border-emerald-500"
                : result.verdictoColor === "rose"
                  ? "border-rose-500"
                  : "border-amber-500"
            }`}
            role="status"
            aria-live="polite"
          >
            <p className="font-medium text-lg">{result.verdict}</p>
          </div>
        </div>
      )}

      {(history.length > 0 || result) && (
        <div className="mt-6 pt-6 border-t border-slate-800">
          <p className="text-slate-500 text-sm mb-3 font-mono">Historial reciente</p>
          <div className="flex flex-wrap gap-2">
            {history.map((n) => (
              <button
                key={n}
                onClick={() => handleQuickPick(n)}
                className="number-tile-3d w-10 h-10 text-xs hover:scale-105 transition-transform"
                aria-label={`Re-analizar ${n.toString().padStart(2, "0")}`}
              >
                {n.toString().padStart(2, "0")}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-6 border-t border-slate-800">
        <p className="text-slate-500 text-sm mb-3 font-mono">Números sugeridos (Top calientes)</p>
        <div className="flex flex-wrap gap-2">
          {[14, 23, 45, 67, 89, 12, 34, 56].map((n) => (
            <button
              key={n}
              onClick={() => handleQuickPick(n)}
              className="number-tile-3d w-10 h-10 text-xs hover:scale-105 transition-transform"
            >
              {n.toString().padStart(2, "0")}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  sublabel: string;
  icon: string;
  valueColor?: string;
}

function StatCard({ label, value, sublabel, icon, valueColor = "" }: StatCardProps) {
  return (
    <div className="glass-panel-3d p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <p className="text-slate-500 text-xs font-medium uppercase tracking-wide">
          {label}
        </p>
      </div>
      <p className={`font-mono text-2xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-slate-500 text-xs mt-1">{sublabel}</p>
    </div>
  );
}