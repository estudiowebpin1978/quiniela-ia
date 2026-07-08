"use client"

import { useEffect, useRef, useState, useMemo } from "react"

interface Particle {
  id: number
  x: number
  y: number
  size: number
  speed: number
  opacity: number
  color: string
  delay: number
}

export function NeonBackground({ intensity = "low" }: { intensity?: "off" | "low" | "medium" | "high" }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)
  const particlesRef = useRef<Particle[]>([])
  const mouseRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (intensity === "off") return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const colors = ["#ff336640", "#a855f740", "#06b6d440", "#ffd70040"]
    const count = intensity === "low" ? 20 : intensity === "medium" ? 40 : 80

    particlesRef.current = Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      size: Math.random() * 3 + 1,
      speed: Math.random() * 0.5 + 0.1,
      opacity: Math.random() * 0.6 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 10000,
    }))

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener("resize", resize)

    const handleMouse = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener("mousemove", handleMouse, { passive: true })

    let lastTime = 0
    const animate = (time: number) => {
      const dt = Math.min(time - lastTime, 50) / 16
      lastTime = time

      ctx.clearRect(0, 0, canvas.width, canvas.height)

      for (const p of particlesRef.current) {
        p.y -= p.speed * dt
        p.x += Math.sin((time + p.delay) / 3000) * 0.3

        if (p.y < -10) {
          p.y = canvas.height + 10
          p.x = Math.random() * canvas.width
        }

        const dx = mouseRef.current.x - p.x
        const dy = mouseRef.current.y - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const mouseEffect = dist < 200 ? (200 - dist) / 200 * 0.3 : 0

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity + mouseEffect
        ctx.fill()
        ctx.globalAlpha = 1
      }

      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener("resize", resize)
      window.removeEventListener("mousemove", handleMouse)
    }
  }, [intensity])

  if (intensity === "off") return null

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  )
}

export function GlowOrbs() {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
      <div style={{
        position: "absolute",
        width: 300,
        height: 300,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(255,51,102,0.15), transparent 70%)",
        top: "10%",
        left: "-5%",
        animation: "float 8s ease-in-out infinite",
        filter: "blur(40px)",
      }} />
      <div style={{
        position: "absolute",
        width: 250,
        height: 250,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(168,85,247,0.12), transparent 70%)",
        top: "40%",
        right: "-8%",
        animation: "float 10s ease-in-out infinite 2s",
        filter: "blur(40px)",
      }} />
      <div style={{
        position: "absolute",
        width: 200,
        height: 200,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(6,182,212,0.1), transparent 70%)",
        bottom: "20%",
        left: "10%",
        animation: "float 12s ease-in-out infinite 4s",
        filter: "blur(40px)",
      }} />
    </div>
  )
}

export function Sparkle({ count = 5 }: { count?: number }) {
  const sparkles = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
      duration: 1.5 + Math.random() * 2,
    })),
    [count]
  )

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {sparkles.map(s => (
        <div
          key={s.id}
          style={{
            position: "absolute",
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "#ffd700",
            boxShadow: "0 0 8px #ffd700, 0 0 16px #ffd70080",
            animation: `pulse-glow ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  )
}

export function ConfettiEffect({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Array<{
    x: number; y: number; vx: number; vy: number; rotation: number
    rotationSpeed: number; color: string; size: number; life: number
  }>>([])

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = window.innerWidth
    canvas.height = window.innerHeight

    const colors = ["#ff3366", "#a855f7", "#06b6d4", "#ffd700", "#22c55e", "#f97316"]
    particlesRef.current = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 4 + 2,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      life: 1,
    }))

    let frame = 0
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      let alive = false

      for (const p of particlesRef.current) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.08
        p.vx *= 0.99
        p.rotation += p.rotationSpeed
        p.life -= 0.008

        if (p.life <= 0) continue
        alive = true

        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.globalAlpha = Math.max(0, p.life)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6)
        ctx.restore()
      }

      frame++
      if (alive && frame < 300) requestAnimationFrame(animate)
      else ctx.clearRect(0, 0, canvas.width, canvas.height)
    }

    requestAnimationFrame(animate)
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    />
  )
}

export function RippleEffect({ x, y, color = "rgba(255,51,102,0.3)", size = 100 }: {
  x: number; y: number; color?: string; size?: number
}) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 600)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div
      style={{
        position: "fixed",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${color}`,
        animation: "ripple 0.6s ease-out forwards",
        pointerEvents: "none",
        zIndex: 9999,
      }}
    />
  )
}

export function NumberReveal({ number, emoji, onComplete }: { number: string; emoji: string; onComplete?: () => void }) {
  const [phase, setPhase] = useState<"spinning" | "revealing" | "done">("spinning")

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("revealing"), 800)
    const t2 = setTimeout(() => { setPhase("done"); onComplete?.() }, 1400)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onComplete])

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      animation: phase === "spinning" ? "rotate-slow 0.5s linear infinite" : "scale-in 0.3s ease-out",
    }}>
      <span style={{ fontSize: 48 }}>{emoji}</span>
      <span style={{
        fontSize: 36,
        fontWeight: 900,
        fontFamily: "var(--font-mono)",
        background: "linear-gradient(135deg, #ffd700, #ff3366)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        textShadow: "0 0 32px rgba(255,215,0,0.3)",
      }}>{number}</span>
    </div>
  )
}

export function ProgressRing({ progress, size = 64, strokeWidth = 4, color = "var(--brand-pink)" }: {
  progress: number; size?: number; strokeWidth?: number; color?: string
}) {
  const radius = (size - strokeWidth) / 2
  const circumference = radius * 2 * Math.PI
  const offset = circumference - (progress / 100) * circumference

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="var(--border-subtle)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke={color}
        strokeWidth={strokeWidth}
        fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 0.5s ease" }}
      />
    </svg>
  )
}