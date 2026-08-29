"use client"

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "60vh", flexDirection: "column", gap: 16, padding: 24
    }}>
      <div style={{ fontSize: 48 }}>⚠️</div>
      <h2 style={{ color: "#fff", fontSize: 20, fontWeight: 800 }}>Algo salió mal</h2>
      <p style={{ color: "var(--text-muted)", fontSize: 14, textAlign: "center", maxWidth: 400 }}>
        Ocurrió un error inesperado. Intentá recargar la página.
      </p>
      <button
        onClick={() => reset()}
        style={{
          background: "linear-gradient(135deg, #a855f7, #6366f1)",
          color: "#fff", border: "none", borderRadius: 12, padding: "12px 24px",
          fontWeight: 700, cursor: "pointer", fontSize: 14
        }}
      >
        Reintentar
      </button>
    </div>
  )
}
