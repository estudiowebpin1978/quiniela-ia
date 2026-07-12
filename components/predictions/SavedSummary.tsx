"use client";
import { useMemo } from "react";

interface SavedSummaryProps {
  misSummary: {
    totalSaved: number;
    totalWithResult: number;
    successRate: number;
    totalAciertos: number;
    thisWeek: number;
    thisWeekHits: number;
    thisWeekRate: number;
    bestTurno: string;
  };
}

export function SavedSummary({ misSummary }: SavedSummaryProps) {
  return useMemo(() => (
    <>
      <div className="saved-summary">
        <div className="saved-summary-card">
          <div className="saved-summary-label">Guardadas</div>
          <div className="saved-summary-value">{misSummary.totalSaved}</div>
        </div>
        <div className="saved-summary-card">
          <div className="saved-summary-label">Con resultado</div>
          <div className="saved-summary-value">{misSummary.totalWithResult}</div>
        </div>
        <div className="saved-summary-card">
          <div className="saved-summary-label">Análisis con coincidencia</div>
          <div className="saved-summary-value">{misSummary.successRate}%</div>
        </div>
        <div className="saved-summary-card">
          <div className="saved-summary-label">Aciertos totales</div>
          <div className="saved-summary-value">{misSummary.totalAciertos}</div>
        </div>
      </div>
      <div className="saved-summary" style={{ marginBottom: 20 }}>
        <div className="saved-summary-card" style={{ gridColumn: "span 2" }}>
          <div className="saved-summary-label">Esta semana</div>
          <div className="saved-summary-value">{misSummary.thisWeek}</div>
          <div style={{fontSize:10,color:"var(--dim)"}}>análisis · {misSummary.thisWeekHits} con coincidencias ({misSummary.thisWeekRate}%)</div>
        </div>
        <div className="saved-summary-card" style={{ gridColumn: "span 2" }}>
          <div className="saved-summary-label">Mejor turno</div>
          <div className="saved-summary-value">{misSummary.bestTurno}</div>
          <div style={{fontSize:10,color:"var(--dim)"}}>con más coincidencias históricas</div>
        </div>
      </div>
    </>
  ), [misSummary]);
}