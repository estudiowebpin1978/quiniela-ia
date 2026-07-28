"use client";

import { useState, useCallback } from "react";
import { supabase } from "@/lib/supabase-browser";
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

const TURNOS_LABELS: Record<string, string> = {
  previa: "Previa",
  primera: "Primera",
  matutina: "Matutina",
  vespertina: "Vespertina",
  nocturna: "Nocturna",
};

export function MiNumeroAnalyzer() {
  const [inputNumber, setInputNumber] = useState("");
  const [result, setResult] = useState<NumberAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  const analyzeNumber = useCallback(async (num: number) => {
    setLoading(true);
    setError(null);

    try {
      const { data: draws, error: drawsError } = await supabase
        .from("draws")
        .select("date, turno, numbers")
        .order("date", { ascending: false })
        .limit(365);

      if (drawsError) throw drawsError;

      if (!draws || draws.length === 0) {
        throw new Error("No hay datos de sorteos disponibles");
      }

      let lastAppearance: NumberAnalysisResult["lastAppearance"] = null;
      let totalCount = 0;
      let last30Days = 0;
      let last90Days = 0;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const appearances: Date[] = [];

      for (const draw of draws) {
        if (draw.numbers && draw.numbers.includes(num)) {
          totalCount++;
          const drawDate = new Date(draw.date);
          appearances.push(drawDate);

          if (drawDate >= thirtyDaysAgo) last30Days++;
          if (drawDate >= ninetyDaysAgo) last90Days++;

          if (!lastAppearance) {
            const diffTime = Math.abs(new Date().getTime() - drawDate.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            lastAppearance = {
              date: draw.date,
              turno: draw.turno,
              daysAgo: diffDays,
            };
          }
        }
      }

      let averageInterval = 0;
      if (appearances.length >= 2) {
        const sortedAppearances = appearances.sort((a, b) => a.getTime() - b.getTime());
        const intervals: number[] = [];
        for (let i = 1; i < sortedAppearances.length; i++) {
          const diff = Math.abs(sortedAppearances[i].getTime() - sortedAppearances[i - 1].getTime());
          intervals.push(Math.ceil(diff / (1000 * 60 * 60 * 24)));
        }
        averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      }

      const currentAbsence = lastAppearance?.daysAgo || 999;
      const calibrationIndex =
        averageInterval > 0
          ? Math.min(100, Math.round((currentAbsence / averageInterval) * 100))
          : 50;

      let hotColdStatus: "hot" | "cold" | "neutral" = "neutral";
      if (last30Days >= 4) hotColdStatus = "hot";
      else if (last30Days === 0 && currentAbsence > 30) hotColdStatus = "cold";

      const allNumbersFreq: Record<number, number> = {};
      for (const draw of draws) {
        if (draw.numbers) {
          for (const n of draw.numbers) {
            allNumbersFreq[n] = (allNumbersFreq[n] || 0) + 1;
          }
        }
      }
      const sortedFreq = Object.entries(allNumbersFreq)
        .sort((a, b) => b[1] - a[1])
        .map(([n]) => parseInt(n));
      const historicalRank = sortedFreq.indexOf(num) + 1;

      let verdict = "";
      let verdictoColor: "emerald" | "amber" | "rose" | "cyan" = "cyan";

      if (calibrationIndex >= 120) {
        verdict = `El ${num.toString().padStart(2, "0")} está Muy Atrasado (${currentAbsence} días sin salir, promedio ${Math.round(averageInterval)}). Alta probabilidad de reversion a la media.`;
        verdictoColor = "emerald";
      } else if (calibrationIndex >= 90) {
        verdict = `El ${num.toString().padStart(2, "0")} está Atrasado (${currentAbsence} días). Cercano a su intervalo promedio de ${Math.round(averageInterval)} días.`;
        verdictoColor = "amber";
      } else if (calibrationIndex >= 60) {
        verdict = `El ${num.toString().padStart(2, "0")} está en Zona Normal (${currentAbsence} días de ausencia). Comportamiento dentro de parámetros estadísticos esperados.`;
        verdictoColor = "cyan";
      } else {
        verdict = `El ${num.toString().padStart(2, "0")} salió Recientemente (hace ${currentAbsence} días). Menor probabilidad inmediata por ley de grandes números.`;
        verdictoColor = "rose";
      }

      const newResult: NumberAnalysisResult = {
        number: num,
        lastAppearance,
        frequency: { total: totalCount, last30Days, last90Days },
        calibrationIndex,
        hotColdStatus,
        averageInterval: Math.round(averageInterval),
        currentAbsence,
        historicalRank,
        verdict,
        verdictoColor,
      };

      setResult(newResult);
      setHistory((prev) => [num, ...prev.filter((n) => n !== num)].slice(0, 10));

      const stored = localStorage.getItem("miNumeroHistory");
      const parsed = stored ? JSON.parse(stored) : [];
      localStorage.setItem(
        "miNumeroHistory",
        JSON.stringify([num, ...parsed.filter((n: number) => n !== num)].slice(0, 20))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al analizar el número");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(inputNumber, 10);
    if (isNaN(num) || num < 0 || num > 99) {
      setError("Ingresá un número válido entre 00 y 99");
      return;
    }
    analyzeNumber(num);
  };

  const handleQuickPick = (num: number) => {
    setInputNumber(num.toString().padStart(2, "0"));
    analyzeNumber(num);
  };

  const statusColors = {
    hot: { bg: "bg-emerald-500/20", border: "border-emerald-500/30", text: "text-emerald-400", label: "🔥 CALIENTE" },
    cold: { bg: "bg-cyan-500/20", border: "border-cyan-500/30", text: "text-cyan-400", label: "❄️ FRÍO" },
    neutral: { bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400", label: "⚖️ NEUTRAL" },
  };

  const verdictoColors = {
    emerald: { bg: "bg-emerald-500/20", border: "border-emerald-500/30", text: "text-emerald-400" },
    amber: { bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400" },
    rose: { bg: "bg-rose-500/20", border: "border-rose-500/30", text: "text-rose-400" },
    cyan: { bg: "bg-cyan-500/20", border: "border-cyan-500/30", text: "text-cyan-400" },
  };

  return (
    <section className="glass-panel-3d p-6 md:p-8 my-8" aria-labelledby="mi-numero-title">
      <header className="mb-6 text-center">
        <h2 id="mi-numero-title" className="font-mono text-2xl md:text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
          Analizador de Mi Número
        </h2>
        <p className="text-slate-400 mt-2 text-sm md:text-base max-w-2xl mx-auto">
          Ingresá tu número de la suerte (00-99) y te decimos su estado estadístico real:
          última salida, frecuencia, atraso promedio y veredicto de calibración.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-md mx-auto mb-8">
        <div className="flex gap-3 mb-4">
          <label htmlFor="mi-numero-input" className="sr-only">
            Tu número (00-99)
          </label>
          <input
            id="mi-numero-input"
            type="text"
            value={inputNumber}
            onChange={(e) => setInputNumber(e.target.value.slice(0, 2).padStart(2, "0"))}
            placeholder="00"
            maxLength={2}
            className="flex-1 glass-panel-3d p-4 text-center font-mono text-2xl font-bold text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            inputMode="numeric"
            pattern="[0-9]{2}"
            autoComplete="off"
            disabled={loading}
          />
          <Button3D
            type="submit"
            variant="primary"
            size="lg"
            loading={loading}
            disabled={loading || !inputNumber}
            className="whitespace-nowrap"
          >
            Analizar
          </Button3D>
        </div>

        {error && (
          <p className="text-rose-400 text-sm text-center mb-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2 text-xs text-slate-500">
          <span>Historial: </span>
          {history.length === 0 ? (
            <span>—</span>
          ) : (
            history.slice(0, 10).map((n, i) => (
              <NumberTile3D key={i} size="sm" variant="slate" number={n.toString().padStart(2, "0")} />
            ))
          )}
        </div>
      </form>

      {result && (
        <div className="space-y-6" role="region" aria-label="Resultado del análisis">
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <NumberTile3D size="lg" variant={result.hotColdStatus === "hot" ? "emerald" : result.hotColdStatus === "cold" ? "cyan" : "amber"} number={result.number.toString().padStart(2, "0")} />
            <div className={`
              ${result.hotColdStatus === "hot" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
               result.hotColdStatus === "cold" ? "bg-cyan-500/20 border-cyan-500/30 text-cyan-400" :
               "bg-amber-500/20 border-amber-500/30 text-amber-400"}
              px-4 py-2 rounded-xl font-mono font-bold text-sm
            `}>
              {result.hotColdStatus === "hot" ? "🔥 CALIENTE" :
               result.hotColdStatus === "cold" ? "❄️ FRÍO" : "⚖️ NEUTRAL"}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass-panel-3d p-4 text-center">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Índice de Calibración</p>
              <p className="font-mono text-3xl font-bold text-emerald-400">{result.calibrationIndex}%</p>
              <div className="w-full h-2 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${
                    result.verdictoColor === "emerald" ? "bg-emerald-500" :
                    result.verdictoColor === "amber" ? "bg-amber-500" :
                    result.verdictoColor === "rose" ? "bg-rose-500" : "bg-cyan-500"
                  }`}
                  style={{ width: `${Math.min(result.calibrationIndex, 100)}%` }}
                ></div>
              </div>
              <p className="text-slate-400 text-xs mt-1">
                {result.calibrationIndex >= 120 ? "Muy atrasado" :
                 result.calibrationIndex >= 90 ? "Atrasado" :
                 result.calibrationIndex >= 60 ? "Normal" : "Reciente"}
              </p>
            </div>

            <div className="glass-panel-3d p-4 text-center">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Última Salida</p>
              {result.lastAppearance ? (
                <>
                  <p className="font-mono text-lg font-bold text-white">
                    {result.lastAppearance.daysAgo} días
                  </p>
                  <p className="text-slate-400 text-sm mt-1">
                    {TURNOS_LABELS[result.lastAppearance.turno] || result.lastAppearance.turno}
                    • {new Date(result.lastAppearance.date).toLocaleDateString("es-AR")}
                  </p>
                </>
              ) : (
                <p className="text-slate-500 text-sm">Nunca en el último año</p>
              )}
            </div>

            <div className="glass-panel-3d p-4 text-center">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-1">Frecuencia (365 días)</p>
              <p className="font-mono text-3xl font-bold text-cyan-400">{result.frequency.total}</p>
              <div className="flex justify-center gap-4 mt-2 text-xs text-slate-400">
                <span>30d: <strong className="text-white">{result.frequency.last30Days}</strong></span>
                <span>90d: <strong className="text-white">{result.frequency.last90Days}</strong></span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="glass-panel-3d p-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Intervalo Promedio</p>
              <p className="font-mono text-2xl font-bold text-white">{result.averageInterval} días</p>
              <p className="text-slate-400 text-sm mt-1">Ausencia actual: <strong className="text-white">{result.currentAbsence} días</strong></p>
            </div>

            <div className="glass-panel-3d p-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Ranking Histórico</p>
              <p className="font-mono text-2xl font-bold text-amber-400">#{result.historicalRank} de 100</p>
              <p className="text-slate-400 text-sm mt-1">
                {result.historicalRank <= 10 ? "Top 10 más frecuente" :
                 result.historicalRank <= 25 ? "Frecuencia alta" :
                 result.historicalRank <= 50 ? "Frecuencia media" : "Frecuencia baja"}
              </p>
            </div>

            <div className="glass-panel-3d p-4">
              <p className="text-slate-500 text-xs uppercase tracking-wide mb-2">Veredicto</p>
              <div className={`
                ${result.verdictoColor === "emerald" ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
                 result.verdictoColor === "amber" ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
                 result.verdictoColor === "rose" ? "bg-rose-500/20 border-rose-500/30 text-rose-400" :
                 "bg-cyan-500/20 border-cyan-500/30 text-cyan-400"}
                p-3 rounded-xl text-sm leading-relaxed
              `}>
                {result.verdict}
              </div>
            </div>
          </div>

          <div className="glass-panel-3d p-4 text-center text-slate-500 text-xs">
            Basado en sorteos históricos • Solo fines estadísticos • 
            <a href="/terminos" className="underline hover:text-white ml-1">Términos</a>
          </div>
        </div>
      )}
    </section>
  );
}