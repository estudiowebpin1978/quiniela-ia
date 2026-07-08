"use client"
import { useState, useEffect, useCallback, createContext, useContext } from "react"

type ToastType = "success" | "error" | "info" | "warning"
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

  const colors: Record<ToastType, { bg: string; border: string; icon: string }> = {
    success: { bg: "rgba(34,197,94,0.92)", border: "rgba(34,197,94,0.4)", icon: "✅" },
    error: { bg: "rgba(239,68,68,0.92)", border: "rgba(239,68,68,0.4)", icon: "❌" },
    info: { bg: "rgba(26,26,46,0.92)", border: "rgba(255,255,255,0.1)", icon: "ℹ️" },
    warning: { bg: "rgba(249,115,22,0.92)", border: "rgba(249,115,22,0.4)", icon: "⚠️" },
  }

  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="toast-container">
        {toasts.map(t => {
          const c = colors[t.type]
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              {t.message}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}