/**
 * Banner de honestidad estadística y calibración (Brier score).
 * Muestra al usuario que el modelo está calibrado, no garantiza acierto.
 */
export default function CalibrationBanner({ score, sampleSize, date }: { score: number | null; sampleSize: number; date?: string }) {
  const pct = score !== null ? Math.max(0, Math.round(100 - (score * 400))) : null
  return (
    <div style={{ background: "linear-gradient(90deg,rgba(245,158,11,.12),rgba(34,197,94,.08))", border: "1px solid rgba(245,158,11,.25)", borderRadius: 12, padding: 14, marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", marginBottom: 6 }}>📊 Calibración del modelo</div>
      <div style={{ fontSize: 12, color: "#cbd5e1", lineHeight: 1.6 }}>
        <strong>Brier score:</strong> {score !== null ? score.toFixed(3) : "—"} ·{" "}
        <strong>Muestra:</strong> {sampleSize} predicciones verificadas{" "}
        {pct !== null ? `· <strong>Calibración:</strong> ${pct}%` : ""}
        <span style={{ color: "#94a3b8", marginLeft: 4 }}>
          — Cada sorteo es independiente; no aumenta probabilidad matemática. Este modelo optimiza valor esperado (evita división de pozo) y mide honestamente su error.
        </span>
      </div>
    </div>
  )
}
