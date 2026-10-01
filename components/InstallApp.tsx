"use client"
import { useEffect, useState } from "react"

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

export default function InstallApp() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showIOS, setShowIOS] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem("qia-install-dismissed")) { queueMicrotask(() => setDismissed(true)); return }
      if (window.matchMedia("(display-mode: standalone)").matches) { queueMicrotask(() => setInstalled(true)); return }
    } catch {}

    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    const isAndroid = /Android/.test(ua)
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true

    if (isStandalone) { queueMicrotask(() => setInstalled(true)); return }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    const onInstalled = () => { setInstalled(true); setVisible(false); setDeferred(null) }

    window.addEventListener("beforeinstallprompt", onPrompt)
    window.addEventListener("appinstalled", onInstalled)

    if (isIOS && !isStandalone) queueMicrotask(() => setShowIOS(true))
    else if (isAndroid && !isStandalone && !deferred) queueMicrotask(() => setVisible(true))

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt)
      window.removeEventListener("appinstalled", onInstalled)
    }
  }, [])

  const install = async () => {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      if (choice.outcome === "accepted") setVisible(false)
      setDeferred(null)
    }
  }

  const dismiss = () => {
    setVisible(false)
    setShowIOS(false)
    setDismissed(true)
    try { localStorage.setItem("qia-install-dismissed", "1") } catch {}
  }

  if (installed || dismissed) return null

  if (showIOS) {
    return (
      <div style={{
        position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 9999,
        background: "linear-gradient(135deg,#1a1a2e 0%,#16162a 100%)",
        border: "1px solid rgba(167,139,250,.3)", borderRadius: 16,
        padding: "14px 16px", boxShadow: "0 8px 32px rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", gap: 12,
        maxWidth: 480, margin: "0 auto",
        animation: "slideUp .3s ease-out",
      }}>
        <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>📥 Instalar Quiniela IA</div>
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>
            Tocá <strong style={{ color: "#a78bfa" }}>Compartir</strong> → <strong style={{ color: "#a78bfa" }}>Agregar a pantalla de inicio</strong>
          </div>
        </div>
        <button onClick={dismiss} style={{
          width: 28, height: 28, borderRadius: "50%", border: "none",
          background: "rgba(255,255,255,.1)", color: "#94a3b8",
          cursor: "pointer", fontSize: 14, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>✕</button>
        <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
      </div>
    )
  }

  if (!visible) return null

  return (
    <div style={{
      position: "fixed", bottom: 16, left: 16, right: 16, zIndex: 9999,
      background: "linear-gradient(135deg,#1a1a2e 0%,#16162a 100%)",
      border: "1px solid rgba(167,139,250,.3)", borderRadius: 16,
      padding: "14px 16px", boxShadow: "0 8px 32px rgba(0,0,0,.5)",
      display: "flex", alignItems: "center", gap: 12,
      maxWidth: 480, margin: "0 auto",
      animation: "slideUp .3s ease-out",
    }}>
      <img src="/icon-192.png" alt="" width={40} height={40} style={{ borderRadius: 10, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>📥 Instalar Quiniela IA</div>
        <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Acceso directo en tu pantalla de inicio</div>
      </div>
      <button onClick={install} style={{
        padding: "8px 14px", borderRadius: 10, border: "none",
        background: "linear-gradient(135deg,#a78bfa,#7c3aed)",
        color: "#fff", fontSize: 12, fontWeight: 700,
        cursor: "pointer", flexShrink: 0,
      }}>Instalar</button>
      <button onClick={dismiss} style={{
        width: 28, height: 28, borderRadius: "50%", border: "none",
        background: "rgba(255,255,255,.1)", color: "#94a3b8",
        cursor: "pointer", fontSize: 14, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>✕</button>
      <style>{`@keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
    </div>
  )
}
