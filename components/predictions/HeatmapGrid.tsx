"use client"

interface HeatmapGridProps {
  heatmap: { n: number; f: number; s: string; pct: number }[];
  onNumberClick: (num: number) => void;
}

export default function HeatmapGrid({ heatmap, onNumberClick }: HeatmapGridProps) {
  if (!heatmap?.length) return null

  return (
    <div>
      <div className="sec">🔥 Mapa de Calor</div>
      <div className="heatmap-grid">
        {heatmap.map((h, i) => (
          <div
            key={i}
            className="heatmap-cell"
            style={{
              background: `rgba(254,44,85,${Math.min(1, h.pct * 1.5)})`,
              fontSize: 11,
              fontWeight: 700,
              color: h.pct > 0.5 ? "#fff" : "#94a3b8",
              cursor: "pointer"
            }}
            onClick={() => onNumberClick(h.n)}
            title={`${h.s}: ${h.f} veces (${(h.pct * 100).toFixed(0)}%)`}
          >
            {h.s}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 9, color: "#475569" }}>
        <span>Menos frecuente</span>
        <span>Más frecuente</span>
      </div>
    </div>
  )
}
