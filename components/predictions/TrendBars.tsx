"use client"

interface TrendBarsProps {
  trends: { numero: string; porcentaje: number; significado: string }[];
  stats: {
    masFrecuente?: { numero: string; frecuencia: number; significado: string };
    mayorRetraso?: { numero: string; retraso: number; significado: string };
    trending?: string;
  };
  onNumberClick: (num: string) => void;
}

export default function TrendBars({ trends, stats, onNumberClick }: TrendBarsProps) {
  if (!trends?.length) return null

  return (
    <div>
      <div className="sec">📈 Tendencias</div>

      {/* Stats cards */}
      {stats && (
        <div className="trend-stats">
          {stats.masFrecuente && (
            <div style={{ background: "rgba(239,68,68,.08)", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid rgba(239,68,68,.15)" }}>
              <div style={{ fontSize: 9, color: "#f87171", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Más Frecuente</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#f87171" }}>{stats.masFrecuente.numero}</div>
              <div style={{ fontSize: 9, color: "#94a3b8" }}>{stats.masFrecuente.frecuencia} veces</div>
            </div>
          )}
          {stats.mayorRetraso && (
            <div style={{ background: "rgba(59,130,246,.08)", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid rgba(59,130,246,.15)" }}>
              <div style={{ fontSize: 9, color: "#60a5fa", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Mayor Retraso</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#60a5fa" }}>{stats.mayorRetraso.numero}</div>
              <div style={{ fontSize: 9, color: "#94a3b8" }}>{stats.mayorRetraso.retraso} días</div>
            </div>
          )}
          {stats.trending && (
            <div style={{ background: "rgba(34,197,94,.08)", borderRadius: 10, padding: "10px 8px", textAlign: "center", border: "1px solid rgba(34,197,94,.15)" }}>
              <div style={{ fontSize: 9, color: "#4ade80", fontWeight: 700, textTransform: "uppercase", marginBottom: 4 }}>Tendencia</div>
              <div style={{ fontSize: 14, fontWeight: 900, color: "#4ade80" }}>{stats.trending}</div>
            </div>
          )}
        </div>
      )}

      {/* Trend bars */}
      <div className="trend-bars">
        {trends.slice(0, 10).map((t, i) => (
          <div key={i} className="trend-bar-row">
            <div className="trend-bar-num" onClick={() => onNumberClick(t.numero)} style={{ cursor: "pointer" }}>{t.numero}</div>
            <div style={{ flex: 1 }}>
              <div style={{ height: 8, borderRadius: 4, background: "rgba(255,255,255,.06)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 4,
                  width: Math.min(100, t.porcentaje) + "%",
                  background: `linear-gradient(90deg, ${t.porcentaje > 70 ? "#ef4444" : t.porcentaje > 40 ? "#f59e0b" : "#3b82f6"}, ${t.porcentaje > 70 ? "#f87171" : t.porcentaje > 40 ? "#fbbf24" : "#60a5fa"})`,
                  transition: "width .5s"
                }} />
              </div>
            </div>
            <div className="trend-bar-pct">{t.porcentaje.toFixed(0)}%</div>
            <div className="trend-bar-meaning">{t.significado}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
