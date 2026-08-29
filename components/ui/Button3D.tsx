"use client"

import { ButtonHTMLAttributes, forwardRef, useCallback, useRef, useState } from "react"

type ButtonVariant = "primary" | "secondary" | "ghost" | "outline" | "danger" | "gold" | "neon"
type ButtonSize = "sm" | "md" | "lg" | "xl" | "icon"

interface Button3DProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  haptic?: boolean
  sound?: "click" | "success" | "pop" | "coin" | "whoosh" | "hover"
  glow?: boolean
  loading?: boolean
  icon?: React.ReactNode
  iconPosition?: "left" | "right"
}

const VARIANTS: Record<ButtonVariant, { bg: string; shadow: string; hoverBg: string; pressedShadow: string; glow: string; textColor: string }> = {
  primary: {
    bg: "linear-gradient(135deg, #ff3366, #cc0033)",
    shadow: "0 8px 0 0 #880022, 0 12px 32px rgba(255,51,102,0.4)",
    hoverBg: "linear-gradient(135deg, #ff4d7a, #dd1144)",
    pressedShadow: "0 3px 0 0 #880022, 0 4px 12px rgba(255,51,102,0.3)",
    glow: "0 0 32px rgba(255,51,102,0.3)",
    textColor: "#fff",
  },
  secondary: {
    bg: "linear-gradient(135deg, #6366f1, #4338ca)",
    shadow: "0 8px 0 0 #312e81, 0 12px 32px rgba(99,102,241,0.4)",
    hoverBg: "linear-gradient(135deg, #818cf8, #5b21b6)",
    pressedShadow: "0 3px 0 0 #312e81, 0 4px 12px rgba(99,102,241,0.3)",
    glow: "0 0 32px rgba(99,102,241,0.3)",
    textColor: "#fff",
  },
  ghost: {
    bg: "transparent",
    shadow: "0 4px 12px rgba(0,0,0,0.1)",
    hoverBg: "rgba(255,255,255,0.06)",
    pressedShadow: "0 1px 4px rgba(0,0,0,0.1)",
    glow: "0 0 20px rgba(255,255,255,0.05)",
    textColor: "#e2e8f0",
  },
  outline: {
    bg: "transparent",
    shadow: "0 4px 16px rgba(255,51,102,0.1)",
    hoverBg: "rgba(255,51,102,0.06)",
    pressedShadow: "0 1px 4px rgba(255,51,102,0.1)",
    glow: "0 0 24px rgba(255,51,102,0.15)",
    textColor: "#ff3366",
  },
  danger: {
    bg: "linear-gradient(135deg, #ef4444, #b91c1c)",
    shadow: "0 8px 0 0 #7f1d1d, 0 12px 32px rgba(239,68,68,0.4)",
    hoverBg: "linear-gradient(135deg, #f87171, #dc2626)",
    pressedShadow: "0 3px 0 0 #7f1d1d, 0 4px 12px rgba(239,68,68,0.3)",
    glow: "0 0 32px rgba(239,68,68,0.3)",
    textColor: "#fff",
  },
  gold: {
    bg: "linear-gradient(135deg, #ffd700, #f8b500, #e8a400)",
    shadow: "0 8px 0 0 #b8860b, 0 12px 32px rgba(255,215,0,0.4)",
    hoverBg: "linear-gradient(135deg, #ffe44d, #ffd700, #f8b500)",
    pressedShadow: "0 3px 0 0 #b8860b, 0 4px 12px rgba(255,215,0,0.3)",
    glow: "0 0 40px rgba(255,215,0,0.4)",
    textColor: "#1a1a2e",
  },
  neon: {
    bg: "linear-gradient(135deg, #06b6d4, #0891b2)",
    shadow: "0 8px 0 0 #0e7490, 0 12px 32px rgba(6,182,212,0.4)",
    hoverBg: "linear-gradient(135deg, #22d3ee, #06b6d4)",
    pressedShadow: "0 3px 0 0 #0e7490, 0 4px 12px rgba(6,182,212,0.3)",
    glow: "0 0 40px rgba(6,182,212,0.4), 0 0 80px rgba(6,182,212,0.2)",
    textColor: "#fff",
  },
}

const SIZES: Record<ButtonSize, { padding: string; fontSize: string; minHeight: string; borderRadius: string }> = {
  sm: { padding: "10px 18px", fontSize: "13px", minHeight: "40px", borderRadius: "12px" },
  md: { padding: "14px 24px", fontSize: "15px", minHeight: "48px", borderRadius: "14px" },
  lg: { padding: "16px 28px", fontSize: "16px", minHeight: "54px", borderRadius: "16px" },
  xl: { padding: "18px 32px", fontSize: "18px", minHeight: "60px", borderRadius: "18px" },
  icon: { padding: "12px", fontSize: "20px", minHeight: "48px", borderRadius: "14px" },
}

function triggerHaptic(pattern: "light" | "medium" | "heavy" = "light") {
  if (!navigator?.vibrate) return
  const patterns = { light: [10], medium: [20], heavy: [30] }
  navigator.vibrate(patterns[pattern])
}

const Button3D = forwardRef<HTMLButtonElement, Button3DProps>(
  ({ variant = "primary", size = "md", haptic = true, sound, glow = false, loading = false, icon, iconPosition = "left", children, disabled, onClick, style, ...props }, ref) => {
    const btnRef = useRef<HTMLButtonElement>(null)
    const [pressed, setPressed] = useState(false)
    const v = VARIANTS[variant]
    const s = SIZES[size]

    const handleClick = useCallback(
      (e: React.MouseEvent<HTMLButtonElement>) => {
        if (disabled || loading) return
        if (haptic) triggerHaptic("medium")
        if (sound) {
          import("@/lib/sound/audio-manager").then(m => m.playSound(sound))
        }
        onClick?.(e)
      },
      [disabled, loading, haptic, sound, onClick]
    )

    const handleMouseEnter = useCallback(() => {
      if (sound) {
        import("@/lib/sound/audio-manager").then(m => m.playSound("hover"))
      }
    }, [sound])

    return (
      <button
        ref={ref || btnRef}
        disabled={disabled || loading}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          width: size === "icon" ? undefined : "100%",
          padding: s.padding,
          fontSize: s.fontSize,
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          letterSpacing: "-0.02em",
          color: v.textColor,
          background: v.bg,
          border: variant === "outline" ? "2px solid rgba(255,51,102,0.4)" : "none",
          borderRadius: s.borderRadius,
          minHeight: s.minHeight,
          cursor: disabled || loading ? "not-allowed" : "pointer",
          transform: pressed ? "translateY(3px)" : "translateY(-4px)",
          boxShadow: pressed ? v.pressedShadow : v.shadow,
          transition: "all 120ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          opacity: disabled ? 0.5 : 1,
          filter: disabled ? "grayscale(50%)" : "none",
          overflow: "hidden",
          WebkitTapHighlightColor: "transparent",
          touchAction: "manipulation",
          userSelect: "none",
          ...style,
        }}
        {...props}
      >
        {glow && !pressed && (
          <span
            style={{
              position: "absolute",
              inset: -2,
              borderRadius: "inherit",
              background: "inherit",
              filter: "blur(16px)",
              opacity: 0.4,
              zIndex: -1,
              animation: "pulse-glow 2s ease-in-out infinite",
            }}
          />
        )}
        {loading && (
          <span
            style={{
              width: 20,
              height: 20,
              border: "2px solid transparent",
              borderTopColor: v.textColor,
              borderRadius: "50%",
              animation: "spin 0.6s linear infinite",
            }}
          />
        )}
        {!loading && icon && iconPosition === "left" && <span style={{ display: "flex" }}>{icon}</span>}
        {!loading && children}
        {!loading && icon && iconPosition === "right" && <span style={{ display: "flex" }}>{icon}</span>}
      </button>
    )
  }
)

Button3D.displayName = "Button3D"

export default Button3D

export function IconBubble({ children, size = 40, glow = false, color = "var(--brand-pink)", onClick }: {
  children: React.ReactNode; size?: number; glow?: boolean; color?: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg-glass-strong)",
        border: `1px solid ${color}30`,
        color,
        cursor: "pointer",
        fontSize: size * 0.5,
        boxShadow: glow ? `0 0 24px ${color}40` : "var(--shadow-sm)",
        transition: "all var(--transition-fast)",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  )
}

export function FabButton({ children, position = "bottom-right", onClick }: {
  children: React.ReactNode; position?: "bottom-right" | "bottom-left"; onClick?: () => void
}) {
  const pos = position === "bottom-right"
    ? { right: 20, bottom: "calc(20px + var(--safe-bottom))" }
    : { left: 20, bottom: "calc(20px + var(--safe-bottom))" }

  return (
    <button
      onClick={onClick}
      style={{
        position: "fixed",
        ...pos,
        width: 56,
        height: 56,
        borderRadius: "50%",
        background: "linear-gradient(135deg, #25d366, #128c7e)",
        color: "#fff",
        fontSize: 26,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        border: "none",
        cursor: "pointer",
        boxShadow: "0 8px 0 0 #075e54, 0 12px 32px rgba(37,211,102,0.4)",
        transform: "translateY(-4px)",
        transition: "all 120ms cubic-bezier(0.34, 1.56, 0.64, 1)",
        zIndex: 100,
        WebkitTapHighlightColor: "transparent",
      }}
    >
      {children}
    </button>
  )
}

export function SegmentedControl({ options, value, onChange }: {
  options: { value: string; label: string; icon?: string }[]; value: string; onChange: (val: string) => void
}) {
  return (
    <div style={{
      display: "flex",
      background: "var(--bg-glass)",
      borderRadius: "var(--radius-pill)",
      padding: 3,
      border: "1px solid var(--border-subtle)",
      overflow: "auto",
      WebkitOverflowScrolling: "touch",
      scrollbarWidth: "none",
    }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => {
            triggerHaptic("light")
            onChange(opt.value)
          }}
          style={{
            flex: 1,
            padding: "10px 12px",
            fontSize: 12,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: value === opt.value ? "#fff" : "var(--text-muted)",
            background: value === opt.value ? "linear-gradient(135deg, var(--brand-pink), var(--brand-pink-deep))" : "transparent",
            borderRadius: "var(--radius-pill)",
            border: "none",
            cursor: "pointer",
            whiteSpace: "nowrap",
            transition: "all var(--transition-fast)",
            boxShadow: value === opt.value ? "0 4px 16px rgba(255,51,102,0.3)" : "none",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          {opt.icon && <span style={{ marginRight: 4 }}>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function NumberChip({ number, emoji, score, isHot, isSelected, onClick }: {
  number: string; emoji?: string; score?: number; isHot?: boolean; isSelected?: boolean; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 2,
        padding: "8px 4px",
        background: isSelected ? "var(--brand-pink-glow)" : "var(--bg-glass)",
        border: `1px solid ${isSelected ? "var(--border-glow-pink)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        cursor: "pointer",
        transition: "all var(--transition-fast)",
        minWidth: 54,
        boxShadow: isSelected ? "var(--shadow-glow-pink)" : "none",
        WebkitTapHighlightColor: "transparent",
        position: "relative",
      }}
    >
      {isHot && (
        <span style={{
          position: "absolute",
          top: -4,
          right: -4,
          width: 12,
          height: 12,
          borderRadius: "50%",
          background: "var(--brand-orange)",
          fontSize: 7,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 8px var(--brand-orange-glow)",
        }}>🔥</span>
      )}
      {emoji && <span style={{ fontSize: 18 }}>{emoji}</span>}
      <span style={{ fontSize: 14, fontWeight: 800, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{number}</span>
      {score !== undefined && (
        <span style={{ fontSize: 9, color: score > 70 ? "var(--brand-green)" : "var(--text-muted)", fontWeight: 700 }}>
          {score}%
        </span>
      )}
    </button>
  )
}