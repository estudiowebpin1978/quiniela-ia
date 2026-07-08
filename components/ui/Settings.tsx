"use client"

import { useState, useEffect, createContext, useContext, ReactNode } from "react"
import { useSound } from "@/lib/sound/audio-manager"

interface Settings {
  soundEnabled: boolean
  soundVolume: number
  hapticEnabled: boolean
  particlesEnabled: boolean
  animationsReduced: boolean
}

const SettingsContext = createContext<{
  settings: Settings
  update: (patch: Partial<Settings>) => void
}>({
  settings: { soundEnabled: true, soundVolume: 0.5, hapticEnabled: true, particlesEnabled: true, animationsReduced: false },
  update: () => {},
})

export function useSettings() {
  return useContext(SettingsContext)
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    if (typeof window === "undefined") {
      return { soundEnabled: true, soundVolume: 0.5, hapticEnabled: true, particlesEnabled: true, animationsReduced: false }
    }
    try {
      const saved = localStorage.getItem("quiniela-ia-settings")
      const defaults = { soundEnabled: true, soundVolume: 0.5, hapticEnabled: true, particlesEnabled: true, animationsReduced: false }
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults
    } catch { return { soundEnabled: true, soundVolume: 0.5, hapticEnabled: true, particlesEnabled: true, animationsReduced: false } }
  })

  useEffect(() => {
    try { localStorage.setItem("quiniela-ia-settings", JSON.stringify(settings)) } catch {}
  }, [settings])

  return (
    <SettingsContext.Provider value={{ settings, update: (patch) => setSettings(s => ({ ...s, ...patch })) }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function SoundToggle() {
  const { settings, update } = useSettings()
  return (
    <button
      onClick={() => update({ soundEnabled: !settings.soundEnabled })}
      style={{
        width: 40, height: 40, borderRadius: 10,
        background: settings.soundEnabled ? "var(--brand-pink-glow)" : "var(--bg-glass)",
        border: `1px solid ${settings.soundEnabled ? "var(--border-glow-pink)" : "var(--border-subtle)"}`,
        color: settings.soundEnabled ? "var(--brand-pink)" : "var(--text-muted)",
        fontSize: 18, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all var(--transition-fast)",
      }}
    >
      {settings.soundEnabled ? "🔊" : "🔇"}
    </button>
  )
}

export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings()
  const sound = useSound()

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 420,
          background: "var(--bg-2)", borderTopLeftRadius: 24, borderTopRightRadius: 24,
          padding: "24px 20px", paddingBottom: "calc(24px + var(--safe-bottom))",
          animation: "slide-up 0.3s ease-out",
          maxHeight: "80vh", overflow: "auto",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: "var(--text-primary)" }}>⚙️ Configuración</h3>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: 8,
            background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 14,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Sound */}
          <SettingRow
            icon={settings.soundEnabled ? "🔊" : "🔇"}
            label="Sonidos"
            description="Efectos de sonido en la app"
          >
            <ToggleSwitch checked={settings.soundEnabled} onChange={v => update({ soundEnabled: v })} />
          </SettingRow>

          {/* Volume */}
          {settings.soundEnabled && (
            <div style={{ paddingLeft: 40 }}>
              <input
                type="range"
                min={0} max={1} step={0.1}
                value={settings.soundVolume}
                onChange={e => {
                  const v = parseFloat(e.target.value)
                  update({ soundVolume: v })
                  sound.setVolume(v)
                }}
                style={{ width: "100%", accentColor: "var(--brand-pink)" }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                <span>Bajo</span>
                <span>{Math.round(settings.soundVolume * 100)}%</span>
                <span>Alto</span>
              </div>
            </div>
          )}

          {/* Haptic */}
          <SettingRow
            icon="📳"
            label="Vibración"
            description="Feedback táctil en botones"
          >
            <ToggleSwitch checked={settings.hapticEnabled} onChange={v => update({ hapticEnabled: v })} />
          </SettingRow>

          {/* Particles */}
          <SettingRow
            icon="✨"
            label="Partículas"
            description="Fondo animado con partículas"
          >
            <ToggleSwitch checked={settings.particlesEnabled} onChange={v => update({ particlesEnabled: v })} />
          </SettingRow>

          {/* Reduced Motion */}
          <SettingRow
            icon="🎭"
            label="Movimiento reducido"
            description="Menos animaciones"
          >
            <ToggleSwitch checked={settings.animationsReduced} onChange={v => update({ animationsReduced: v })} />
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ icon, label, description, children }: {
  icon: string; label: string; description: string; children: React.ReactNode
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 14px", borderRadius: 12,
      background: "var(--bg-glass)", border: "1px solid var(--border-subtle)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{label}</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{description}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        width: 48, height: 28, borderRadius: 14, padding: 3,
        background: checked ? "var(--brand-pink)" : "var(--bg-3)",
        border: "none", cursor: "pointer", position: "relative",
        transition: "all var(--transition-fast)",
        flexShrink: 0,
      }}
    >
      <div style={{
        width: 22, height: 22, borderRadius: "50%",
        background: "#fff",
        transform: checked ? "translateX(20px)" : "translateX(0)",
        transition: "transform var(--transition-fast)",
        boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
      }} />
    </button>
  )
}