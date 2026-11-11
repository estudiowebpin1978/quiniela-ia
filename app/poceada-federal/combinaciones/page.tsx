"use client"

/**
 * Ruta heredada. La vista oficial vive en /poceada-federal.
 * Esta página solo redirige — no duplica motor ni datos.
 */
import { useEffect } from "react"
import { useRouter } from "next/navigation"

export default function PoceadaFederalCombinaciones() {
  const router = useRouter()
  useEffect(() => {
    router.replace("/poceada-federal")
  }, [router])

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#e6e6e6",
        background: "linear-gradient(180deg,#010101,#0d0d0d)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <h1 style={{ color: "#f5c542", margin: 0 }}>Poceada Federal</h1>
        <p style={{ color: "#9aa0a6" }}>Redirigiendo a la vista principal...</p>
        <a href="/poceada-federal" style={{ color: "#22c55e" }}>Ir a Combinaciones</a>
      </div>
    </div>
  )
}
