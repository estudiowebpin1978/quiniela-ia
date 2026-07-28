"use client";

import React, { useState } from "react";
import { Sparkles, Check, Copy, ShieldAlert, Award } from "lucide-react";
import { NumberTile3D } from "@/components/ui/number-tile-3d";
import { Button3D } from "@/components/ui/button-3d";

interface PredictionCard3DProps {
  turno: "Previa" | "Primera" | "Matutina" | "Vespertina" | "Nocturna";
  dateStr: string;
  cifras2: string;
  cifras3?: string;
  cifras4?: string;
  redoblona?: [string, string];
  confidenceScore: number; // 0 - 100
  isPremiumUser: boolean;
  onSavePrediction?: () => void;
}

export const PredictionCard3D: React.FC<PredictionCard3DProps> = ({
  turno,
  dateStr,
  cifras2,
  cifras3 = "---",
  cifras4 = "----",
  redoblona = ["--", "--"],
  confidenceScore,
  isPremiumUser,
  onSavePrediction,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const text = `Quiniela IA - ${turno} (${dateStr}): 2 Cifras: ${cifras2} | 3 Cifras: ${
      isPremiumUser ? cifras3 : "LOCKED"
    }`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative w-full max-w-xl rounded-3xl p-6 glass-panel-3d glow-cyan-lg overflow-hidden transition-all duration-300 hover:border-cyan-500/40">
      {/* Fondo Decorativo en 3D */}
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Encabezado: Turno y Fecha */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
        <div>
          <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
            Sorteo Nacional / Ciudad
          </span>
          <h3 className="text-2xl font-black text-white text-3d-title flex items-center gap-2">
            Turno {turno}
          </h3>
        </div>
        <div className="text-right">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-slate-950/80 text-slate-300 border border-slate-800 badge-3d">
            {dateStr}
          </span>
        </div>
      </div>

      {/* Cuerpo Principal: Número Destacado (2 Cifras - Todos los usuarios) */}
      <div className="my-6 flex flex-col items-center justify-center gap-3">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          Predicción Principal (2 Cifras)
        </span>
        <NumberTile3D number={cifras2} size="lg" variant="emerald" />
      </div>

      {/* Desglose Premium: 3 Cifras, 4 Cifras & Redoblona */}
      <div className="grid grid-cols-3 gap-3 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 mb-6">
        <NumberTile3D
          label="3 Cifras"
          number={isPremiumUser ? cifras3 : "🔒"}
          size="sm"
          variant={isPremiumUser ? "cyan" : "slate"}
        />
        <NumberTile3D
          label="4 Cifras"
          number={isPremiumUser ? cifras4 : "🔒"}
          size="sm"
          variant={isPremiumUser ? "cyan" : "slate"}
        />
        <NumberTile3D
          label="Redoblona"
          number={isPremiumUser ? `${redoblona[0]}-${redoblona[1]}` : "🔒"}
          size="sm"
          variant={isPremiumUser ? "amber" : "slate"}
        />
      </div>

      {!isPremiumUser && (
        <div className="flex items-center gap-2 p-3 mb-6 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs">
          <ShieldAlert className="w-4 h-4 shrink-0" />
          <span>Actualiza a <b>Premium</b> para desbloquear las 3 y 4 cifras + Redoblona.</span>
        </div>
      )}

      {/* Medidor Táctil de Calibración / Confianza */}
      <div className="space-y-2 mb-6">
        <div className="flex justify-between items-center text-xs">
          <span className="font-semibold text-slate-400 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-cyan-400" /> Índice de Calibración IA
          </span>
          <span className="font-mono font-bold text-cyan-400">{confidenceScore.toFixed(1)}%</span>
        </div>
        <div className="w-full h-3 rounded-full bg-slate-950 p-0.5 border border-slate-800 badge-3d">
          <div
            className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-1000 shadow-[0_0_12px_rgba(6,182,212,0.6)]"
            style={{ width: `${Math.min(100, Math.max(0, confidenceScore))}%` }}
          />
        </div>
      </div>

      {/* Acciones Táctiles 3D */}
      <div className="flex gap-3">
        <Button3D
          variant="primary"
          size="md"
          fullWidth
          icon={<Sparkles className="w-4 h-4" />}
          onClick={onSavePrediction}
        >
          Guardar Jugada
        </Button3D>

        <Button3D
          variant="secondary"
          size="md"
          icon={copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          onClick={handleCopy}
        >
          {copied ? "Copiado" : ""}
        </Button3D>
      </div>
    </div>
  );
};