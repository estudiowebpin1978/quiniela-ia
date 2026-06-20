"use client"
import { useState, useEffect, useCallback, createContext, useContext } from "react"

type ToastType = "success" | "error" | "info"
interface ToastMsg { id: number; message: string; type: ToastType }

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([])
  const add = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
  }, [])
  useEffect(() => {
    if (toasts.length === 0) return
    const t = setTimeout(() => setToasts(prev => prev.slice(1)), 3000)
    return () => clearTimeout(t)
  }, [toasts])

  const colors: Record<ToastType, string> = { success: "#22c55e", error: "#ef4444", info: "#3b82f6" }
  const icons: Record<ToastType, string> = { success: "✅", error: "❌", info: "ℹ️" }

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 10000, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            background: colors[t.type], color: "#fff",
            padding: "12px 24px", borderRadius: 12, fontSize: 13, fontWeight: 700,
            boxShadow: `0 8px 24px ${colors[t.type]}40`,
            animation: "toastIn .2s ease-out",
            pointerEvents: "auto",
          }}>
            {icons[t.type]} {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
