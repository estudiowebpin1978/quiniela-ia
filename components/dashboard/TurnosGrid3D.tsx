"use client";

import React from "react";
import { Clock, CheckCircle2, Loader2, PlayCircle } from "lucide-react";

export type TurnoStatus = "completed" | "processing" | "scheduled";

export interface TurnoInfo {
  name: "Previa" | "Primera" | "Matutina" | "Vespertina" | "Nocturna";
  time: string;
  status: TurnoStatus;
  headNumber?: string;
}

interface TurnosGrid3DProps {
  turnos: TurnoInfo[];
  selectedTurno: string;
  onSelectTurno: (turnoName: string) => void;
}

export const TurnosGrid3D: React.FC<TurnosGrid3DProps> = ({
  turnos,
  selectedTurno,
  onSelectTurno,
}) => {
  const statusBadges = {
    completed: {
      label: "Finalizado",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
    },
    processing: {
      label: "En Sorteo",
      color: "bg-amber-500/10 text-amber-400 border-amber-500/30 animate-pulse",
      icon: <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />,
    },
    scheduled: {
      label: "Pendiente",
      color: "bg-slate-800/50 text-slate-400 border-slate-700/50",
      icon: <Clock className="w-3.5 h-3.5 text-slate-400" />,
    },
  };

  return (
    <div className="w-full">
      <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
        <PlayCircle className="w-4 h-4 text-cyan-400" /> Sorteos del Día (Ciudad / Nacional)
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {turnos.map((t) => {
          const isSelected = selectedTurno === t.name;
          const statusInfo = statusBadges[t.status];

          return (
            <button
              key={t.name}
              onClick={() => onSelectTurno(t.name)}
              className={`relative flex flex-col justify-between p-4 rounded-2xl text-left transition-all duration-150 cursor-pointer select-none active:translate-y-[3px] ${
                isSelected
                  ? "bg-slate-900 border-2 border-cyan-400 shadow-[0_6px_0_0_#0284c7] -translate-y-1 glow-cyan-lg"
                  : "bg-slate-950/80 border border-slate-800 shadow-[0_4px_0_0_#0f172a] hover:border-slate-700 hover:-translate-y-0.5"
              }`}
            >
              <div>
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono font-semibold text-slate-400">{t.time}</span>
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusInfo.color}`}
                  >
                    {statusInfo.icon}
                  </span>
                </div>
                <h4 className="text-lg font-black text-white tracking-wide">{t.name}</h4>
              </div>

              {/* Muestra la cabeza si el sorteo ya ocurrió */}
              <div className="mt-4 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-slate-500">A la Cabeza</span>
                <span className="font-mono font-bold text-sm text-cyan-300">
                  {t.headNumber || "----"}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};