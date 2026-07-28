"use client";

import React from "react";

interface NumberTile3DProps {
  number: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "emerald" | "cyan" | "amber" | "slate";
}

export const NumberTile3D: React.FC<NumberTile3DProps> = ({
  number,
  label,
  size = "md",
  variant = "emerald",
}) => {
  const sizeClasses = {
    sm: "px-3 py-1.5 text-lg rounded-lg border-b-2",
    md: "px-5 py-3 text-2xl md:text-3xl rounded-xl border-b-4",
    lg: "px-7 py-4 text-4xl md:text-5xl rounded-2xl border-b-8 tracking-wider",
  };

  const variantGradients = {
    emerald:
      "from-emerald-950/80 via-slate-900 to-slate-950 border-emerald-500/30 text-emerald-400 shadow-emerald-950/80",
    cyan: "from-cyan-950/80 via-slate-900 to-slate-950 border-cyan-500/30 text-cyan-400 shadow-cyan-950/80",
    amber:
      "from-amber-950/80 via-slate-900 to-slate-950 border-amber-500/30 text-amber-400 shadow-amber-950/80",
    slate:
      "from-slate-800 via-slate-900 to-slate-950 border-slate-700/50 text-slate-200 shadow-slate-950",
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      {label && (
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
      )}
      <div
        className={`relative inline-flex items-center justify-center font-mono font-black tabular-nums bg-gradient-to-b ${variantGradients[variant]} ${sizeClasses[size]} number-tile-3d transition-transform hover:-translate-y-0.5`}
      >
        <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{number}</span>
      </div>
    </div>
  );
};