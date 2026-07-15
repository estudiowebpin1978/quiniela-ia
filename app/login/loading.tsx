export default function Loading() {
  return (
    <div style={{
      display: "flex", justifyContent: "center", alignItems: "center",
      minHeight: "60vh", flexDirection: "column", gap: 16
    }}>
      <div style={{
        width: 40, height: 40, border: "3px solid rgba(168,85,247,0.2)",
        borderTopColor: "#a855f7", borderRadius: "50%",
        animation: "spin 0.8s linear infinite"
      }} />
      <p style={{ color: "var(--text-muted)", fontSize: 14 }}>Cargando...</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
