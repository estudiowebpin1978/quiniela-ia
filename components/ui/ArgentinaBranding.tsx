"use client"

import { ReactNode } from "react"

export function ArgentinaFlag({ size = 24 }: { size?: number }) {
  return (
    <div style={{
      width: size,
      height: size * 0.66,
      borderRadius: 3,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      border: "1px solid rgba(255,255,255,0.1)",
    }}>
      <div style={{ flex: 1, background: "#74acdf" }} />
      <div style={{ flex: 1, background: "#fff" }} />
      <div style={{ flex: 1, background: "#74acdf" }} />
    </div>
  )
}

export function SunOfMay({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="20" fill="#f8b500" />
      {[...Array(16)].map((_, i) => {
        const angle = (i * 22.5 * Math.PI) / 180
        const len = i % 2 === 0 ? 35 : 28
        return (
          <line
            key={i}
            x1={50 + Math.cos(angle) * 22}
            y1={50 + Math.sin(angle) * 22}
            x2={50 + Math.cos(angle) * len}
            y2={50 + Math.sin(angle) * len}
            stroke="#f8b500"
            strokeWidth={i % 2 === 0 ? 3 : 2}
            strokeLinecap="round"
          />
        )
      })}
    </svg>
  )
}

export function QuinielaHero({ children }: { children: ReactNode }) {
  return (
    <div style={{
      position: "relative",
      background: "linear-gradient(180deg, rgba(116,172,223,0.12) 0%, transparent 60%)",
      borderRadius: "var(--radius-2xl)",
      padding: "24px 16px",
      marginBottom: 24,
      overflow: "hidden",
      border: "1px solid rgba(116,172,223,0.15)",
    }}>
      <div style={{
        position: "absolute", top: -20, right: -20,
        opacity: 0.08, transform: "rotate(15deg)",
      }}>
        <SunOfMay size={120} />
      </div>
      {children}
    </div>
  )
}

export function TurnoCard({ turno, hora, isSelected, isLive, onClick }: {
  turno: string; hora: string; isSelected: boolean; isLive?: boolean; onClick: () => void
}) {
  const turnoEmoji: Record<string, string> = {
    Previa: "🌅", Primera: "☀️", Matutina: "🌤️", Vespertina: "🌇", Nocturna: "🌙"
  }

  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 64,
        padding: "12px 6px",
        borderRadius: 14,
        background: isSelected ? "linear-gradient(135deg, var(--brand-pink), var(--brand-pink-deep))" : "var(--bg-glass)",
        border: `1px solid ${isSelected ? "var(--border-glow-pink)" : "var(--border-subtle)"}`,
        boxShadow: isSelected ? "0 8px 24px rgba(255,51,102,0.3)" : "none",
        cursor: "pointer",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
        transition: "all var(--transition-fast)",
        position: "relative",
        WebkitTapHighlightColor: "transparent",
        color: isSelected ? "#fff" : "var(--text-primary)",
      }}
    >
      {isLive && (
        <div style={{
          position: "absolute", top: 4, right: 4,
          width: 8, height: 8, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 8px rgba(34,197,94,0.6)",
          animation: "pulse-glow 1.5s ease-in-out infinite",
        }} />
      )}
      <span style={{ fontSize: 20 }}>{turnoEmoji[turno] || "🎲"}</span>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.05em" }}>{turno}</span>
      <span style={{ fontSize: 9, opacity: 0.6 }}>{hora}</span>
    </button>
  )
}

export function ScoreBar({ score, label, color = "var(--brand-pink)" }: {
  score: number; label: string; color?: string
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)" }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "var(--font-mono)" }}>{score}%</span>
      </div>
      <div style={{
        height: 6, borderRadius: 3,
        background: "var(--bg-glass-strong)",
        overflow: "hidden",
      }}>
        <div style={{
          height: "100%", borderRadius: 3,
          width: `${Math.min(100, score)}%`,
          background: `linear-gradient(90deg, ${color}, ${color}80)`,
          boxShadow: `0 0 12px ${color}40`,
          transition: "width 0.5s ease",
        }} />
      </div>
    </div>
  )
}

export function StatCard({ icon, value, label, color = "var(--brand-pink)" }: {
  icon: string; value: string | number; label: string; color?: string
}) {
  return (
    <div style={{
      padding: "14px 12px", borderRadius: 14,
      background: "var(--bg-glass)",
      border: `1px solid ${color}20`,
      textAlign: "center",
      flex: 1,
      minWidth: 70,
    }}>
      <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 900, color, fontFamily: "var(--font-mono)" }}>{value}</div>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginTop: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>{label}</div>
    </div>
  )
}

export function PremiumBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <div style={{
      position: "relative", borderRadius: 16, overflow: "hidden",
      background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(99,102,241,0.1))",
      border: "1px solid rgba(168,85,247,0.25)",
      padding: "16px 14px",
    }}>
      <div style={{
        position: "absolute", top: -30, right: -30, opacity: 0.06, transform: "rotate(15deg)",
      }}>
        <SunOfMay size={100} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <span style={{ fontSize: 24 }}>⭐</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Premium</div>
          <div style={{ fontSize: 10, color: "var(--brand-purple)" }}>Desbloqueá todo</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
        {["Top 10 con score detallado", "Números de 3 y 4 cifras", "16 motores de IA"].map((feat, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-secondary)" }}>
            <span style={{ color: "var(--brand-green)", fontWeight: 900 }}>✓</span>
            {feat}
          </div>
        ))}
      </div>
      <button
        onClick={onUpgrade}
        style={{
          width: "100%", padding: "10px 16px",
          background: "linear-gradient(135deg, var(--brand-purple), #7c3aed)",
          color: "#fff", fontWeight: 800, fontSize: 13,
          borderRadius: 12, border: "none", cursor: "pointer",
          boxShadow: "0 4px 16px rgba(168,85,247,0.3)",
        }}
      >
        🔓 Desbloquear Premium
      </button>
    </div>
  )
}

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{
      padding: compact ? "8px 10px" : "10px 12px",
      borderRadius: 10,
      background: "rgba(99,102,241,0.06)",
      border: "1px solid rgba(99,102,241,0.1)",
      marginTop: compact ? 8 : 16,
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text-muted)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        ⚠️ Análisis, no predicción
      </div>
      <div style={{ fontSize: 9, color: "var(--text-muted)", lineHeight: 1.4 }}>
        Los sorteos son eventos aleatorios e independientes. Las tendencias históricas no garantizan resultados futuros.
      </div>
    </div>
  )
}