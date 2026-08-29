"use client"

import { ReactNode, useEffect, useState, useRef } from "react"
import { SettingsProvider, useSettings, SettingsPanel, SoundToggle } from "./Settings"

function StatusBar({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
      height: "calc(44px + var(--safe-top))",
      paddingTop: "var(--safe-top)",
      background: "rgba(3,3,7,0.85)", backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderBottom: "1px solid var(--border-subtle)",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 16px",
    }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-display)" }}>
        {title}
      </span>
      {right}
    </div>
  )
}

function BottomBar({ items, active, onChange }: {
  items: { icon: string; label: string; value: string }[]; active: string; onChange: (v: string) => void
}) {
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
      height: "calc(56px + var(--safe-bottom))",
      paddingBottom: "var(--safe-bottom)",
      background: "rgba(3,3,7,0.9)", backdropFilter: "blur(20px) saturate(180%)",
      WebkitBackdropFilter: "blur(20px) saturate(180%)",
      borderTop: "1px solid var(--border-subtle)",
      display: "flex", alignItems: "center", justifyContent: "space-around",
      padding: "0 8px",
    }}>
      {items.map(item => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            padding: "6px 12px", borderRadius: 10,
            background: active === item.value ? "var(--brand-pink-glow)" : "transparent",
            border: "none", cursor: "pointer",
            minWidth: 56,
            transition: "all var(--transition-fast)",
          }}
        >
          <span style={{
            fontSize: 20,
            transform: active === item.value ? "scale(1.15)" : "scale(1)",
            transition: "transform var(--transition-fast)",
          }}>{item.icon}</span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            color: active === item.value ? "var(--brand-pink)" : "var(--text-muted)",
          }}>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function PullToRefresh({ onRefresh, children }: { onRefresh: () => Promise<void>; children: ReactNode }) {
  const [pulling, setPulling] = useState(false)
  const [pullY, setPullY] = useState(0)
  const startY = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (containerRef.current?.scrollTop === 0) {
      startY.current = e.touches[0].clientY
      setPulling(true)
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!pulling) return
    const diff = Math.min(e.touches[0].clientY - startY.current, 120)
    setPullY(Math.max(0, diff))
  }

  const handleTouchEnd = async () => {
    if (pullY > 60) {
      await onRefresh()
    }
    setPulling(false)
    setPullY(0)
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateY(${pullY * 0.5}px)`,
        transition: pulling ? "none" : "transform 0.3s ease",
        overflowY: "auto",
        minHeight: "100vh",
      }}
    >
      {pullY > 0 && (
        <div style={{
          position: "fixed", top: "calc(44px + var(--safe-top))", left: 0, right: 0,
          height: pullY * 0.5,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)", fontSize: 12, fontWeight: 700,
          transition: pulling ? "none" : "all 0.3s ease",
        }}>
          {pullY > 60 ? "↻ Soltar para actualizar" : "↓ Deslizar para actualizar"}
        </div>
      )}
      {children}
    </div>
  )
}

function ScrollToTop() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const handleScroll = () => setVisible(window.scrollY > 400)
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  if (!visible) return null

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      style={{
        position: "fixed", bottom: "calc(76px + var(--safe-bottom))", right: 16,
        width: 44, height: 44, borderRadius: "50%",
        background: "var(--bg-card)", border: "1px solid var(--border-default)",
        boxShadow: "var(--shadow-lg)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 18, color: "var(--text-primary)",
        animation: "slide-up 0.3s ease-out",
        zIndex: 40,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      ↑
    </button>
  )
}

function NetworkStatus() {
  const [online, setOnline] = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true)

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [])

  if (online) return null

  return (
    <div style={{
      position: "fixed", top: "calc(44px + var(--safe-top))", left: 0, right: 0,
      padding: "8px 16px", background: "var(--brand-orange)",
      color: "#fff", fontSize: 12, fontWeight: 700, textAlign: "center",
      zIndex: 60,
    }}>
      ⚠️ Sin conexión. Los datos mostrados pueden estar desactualizados.
    </div>
  )
}

function SplashScreen({ onComplete }: { onComplete: () => void }) {
  useEffect(() => {
    const t = setTimeout(onComplete, 1500)
    return () => clearTimeout(t)
  }, [onComplete])

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "linear-gradient(135deg, #030307, #0a0a12)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      gap: 16, animation: "scale-in 0.3s ease-out",
    }}>
      <div style={{
        width: 80, height: 80, borderRadius: 24,
        background: "linear-gradient(135deg, #ff3366, #cc0033)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 44, boxShadow: "0 8px 0 #990033, 0 12px 32px rgba(255,51,102,0.5)",
        animation: "float 2s ease-in-out infinite",
      }}>📊</div>
      <div style={{
        fontSize: 28, fontWeight: 900, fontFamily: "var(--font-display)",
        background: "linear-gradient(135deg, #ff6699, #ff3366, #cc0033)",
        WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
      }}>Quiniela IA</div>
      <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%",
            background: "var(--brand-pink)",
            animation: `pulse-glow 1s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  )
}

export function MobileLayout({ children, title = "Quiniela IA", tabs, activeTab, onTabChange }: {
  children: ReactNode; title?: string
  tabs?: { icon: string; label: string; value: string }[]
  activeTab?: string; onTabChange?: (v: string) => void
}) {
  const [showSplash, setShowSplash] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const { settings } = useSettings()

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}
      <div style={{
        minHeight: "100vh",
        paddingTop: "calc(44px + var(--safe-top))",
        paddingBottom: tabs ? "calc(56px + var(--safe-bottom))" : "var(--safe-bottom)",
        paddingLeft: "var(--safe-left)",
        paddingRight: "var(--safe-right)",
      }}>
        <StatusBar
          title={title}
          right={
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <SoundToggle />
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
                  color: "var(--text-muted)", fontSize: 18, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >⚙️</button>
            </div>
          }
        />
        <NetworkStatus />
        <PullToRefresh onRefresh={async () => { window.location.reload() }}>
          {children}
        </PullToRefresh>
        {tabs && activeTab && onTabChange && (
          <BottomBar items={tabs} active={activeTab} onChange={onTabChange} />
        )}
        <ScrollToTop />
      </div>
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </>
  )
}

export function PullIndicator({ progress }: { progress: number }) {
  if (progress <= 0) return null
  return (
    <div style={{
      display: "flex", justifyContent: "center", padding: 8,
      color: "var(--text-muted)", fontSize: 12, fontWeight: 700,
    }}>
      {progress > 60 ? "↻ Soltar para actualizar" : "↓ Deslizar para actualizar"}
    </div>
  )
}

export function SafeAreaSpacer() {
  return <div style={{ height: "var(--safe-bottom)" }} />
}