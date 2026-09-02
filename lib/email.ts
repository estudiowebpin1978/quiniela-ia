/**
 * Email service using Resend API.
 * Requires RESEND_API_KEY env var.
 *
 * Emails sent:
 *   1. Welcome — on first signup
 *   2. Win notification — when prediction hits
 *   3. Weekly digest — every Monday morning
 *   4. Re-engagement — 7 days inactive
 *   5. Premium expiry reminder — 3 days before expiry
 */

import logger from "@/lib/logger"

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = "Quiniela IA <notificaciones@quiniela-ia.com>"
const APP_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://quiniela-ia-two.vercel.app"

interface EmailResult {
  ok: boolean
  id?: string
  error?: string
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<EmailResult> {
  if (!RESEND_API_KEY) {
    logger.warn("[email] RESEND_API_KEY not configured, skipping email", { to, subject })
    return { ok: false, error: "RESEND_API_KEY not configured" }
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM_EMAIL, to: [to], subject, html }),
    })

    const data = await res.json()

    if (!res.ok) {
      logger.error("[email] Send failed", { to, subject, status: res.status, error: data })
      return { ok: false, error: data.message || "Send failed" }
    }

    logger.info("[email] Sent", { to, subject, id: data.id })
    return { ok: true, id: data.id }
  } catch (e) {
    logger.error("[email] Send exception", { to, subject, error: String(e) })
    return { ok: false, error: String(e) }
  }
}

// ── Templates ──────────────────────────────────────────────────────────────

const baseStyles = `
  body { margin: 0; padding: 0; background: #0a0a14; font-family: 'Inter', -apple-system, sans-serif; }
  .container { max-width: 560px; margin: 0 auto; padding: 32px 24px; }
  .header { text-align: center; margin-bottom: 32px; }
  .logo { font-size: 32px; margin-bottom: 8px; }
  .title { font-size: 24px; font-weight: 800; color: #fff; margin: 0; }
  .subtitle { font-size: 14px; color: #94a3b8; margin-top: 8px; }
  .card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 16px; padding: 24px; margin: 20px 0; }
  .btn { display: inline-block; padding: 14px 32px; border-radius: 12px; font-weight: 700; font-size: 15px; text-decoration: none; color: #fff; background: linear-gradient(135deg, #ff3366, #ff6b81); }
  .stat { text-align: center; padding: 12px; }
  .stat-value { font-size: 36px; font-weight: 900; color: #ff3366; }
  .stat-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
  .footer { text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #64748b; }
  .footer a { color: #94a3b8; text-decoration: underline; }
`

function wrap(body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${baseStyles}</style></head><body><div class="container">${body}</div></body></html>`
}

export async function sendWelcomeEmail(to: string, name: string): Promise<EmailResult> {
  return sendEmail(to, "Bienvenido a Quiniela IA 🎱", wrap(`
    <div class="header">
      <div class="logo">🎱</div>
      <h1 class="title">¡Hola ${name || "querido usuario"}!</h1>
      <p class="subtitle">Tu cuenta está lista. Empezá a predecir con IA.</p>
    </div>
    <div class="card">
      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0">
        Quiniela IA usa <strong>30 factores estadísticos + Machine Learning</strong> para generarte predicciones personalizadas de la Quiniela Nacional.
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/predictions" class="btn">Abrir Quiniela IA</a>
    </div>
    <div class="card" style="display:flex;gap:12px;text-align:center">
      <div class="stat" style="flex:1">
        <div class="stat-value">5</div>
        <div class="stat-label">Sorteos diarios</div>
      </div>
      <div class="stat" style="flex:1">
        <div class="stat-value">30</div>
        <div class="stat-label">Factores IA</div>
      </div>
      <div class="stat" style="flex:1">
        <div class="stat-value">FREE</div>
        <div class="stat-label">Para empezar</div>
      </div>
    </div>
    <div class="footer">
      <p>Estás recibiendo este email porque creaste una cuenta en Quiniela IA.</p>
      <p><a href="${APP_URL}/predictions">Abrir la app</a></p>
    </div>
  `))
}

export async function sendWinEmail(
  to: string,
  name: string,
  data: { turno: string; hitCount: number; date: string; numbers: string[] },
): Promise<EmailResult> {
  const turnoEmoji: Record<string, string> = {
    Previa: "🌅", Primera: "☀️", Matutina: "🌤️", Vespertina: "🌇", Nocturna: "🌙",
  }

  const numbersHtml = data.numbers.map(n =>
    `<span style="display:inline-block;padding:6px 12px;margin:4px;border-radius:8px;background:rgba(34,197,94,0.2);color:#4ade80;font-weight:700;font-size:16px">${n}</span>`
  ).join("")

  return sendEmail(to, `🏆 ¡${data.hitCount} acierto${data.hitCount > 1 ? "s" : ""} en ${data.turno}!`, wrap(`
    <div class="header">
      <div class="logo">🏆</div>
      <h1 class="title">¡Excelente predicción!</h1>
      <p class="subtitle">${turnoEmoji[data.turno] || "🎱"} ${data.turno} — ${data.date}</p>
    </div>
    <div class="card" style="text-align:center">
      <div class="stat-value" style="font-size:48px;margin-bottom:8px">${data.hitCount}</div>
      <div style="font-size:14px;color:#94a3b8;margin-bottom:16px">acierto${data.hitCount > 1 ? "s" : ""}</div>
      <div style="margin:12px 0">${numbersHtml}</div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/predictions" class="btn">Ver mis predicciones</a>
    </div>
    <div class="footer">
      <p>Siguite prediciendo para subir de nivel 🔥</p>
    </div>
  `))
}

export async function sendWeeklyDigest(
  to: string,
  name: string,
  data: { totalHits: number; totalPredictions: number; bestTurno: string; streak: number; level: number },
): Promise<EmailResult> {
  const hitRate = data.totalPredictions > 0
    ? Math.round((data.totalHits / data.totalPredictions) * 100)
    : 0

  return sendEmail(to, `📊 Tu resumen semanal — Quiniela IA`, wrap(`
    <div class="header">
      <div class="logo">📊</div>
      <h1 class="title">Resumen de la semana</h1>
      <p class="subtitle">Hola ${name || ""}, así te fue esta semana</p>
    </div>
    <div class="card" style="display:flex;gap:8px;text-align:center;flex-wrap:wrap">
      <div class="stat" style="flex:1;min-width:100px">
        <div class="stat-value">${data.totalHits}</div>
        <div class="stat-label">Aciertos</div>
      </div>
      <div class="stat" style="flex:1;min-width:100px">
        <div class="stat-value">${hitRate}%</div>
        <div class="stat-label">Precisión</div>
      </div>
      <div class="stat" style="flex:1;min-width:100px">
        <div class="stat-value">🔥${data.streak}</div>
        <div class="stat-label">Racha</div>
      </div>
    </div>
    <div class="card">
      <p style="color:#e2e8f0;font-size:13px;margin:0">
        🏅 <strong>Nivel ${data.level}</strong> &nbsp;|&nbsp;
        ⭐ Mejor turno: <strong>${data.bestTurno}</strong> &nbsp;|&nbsp;
        🎯 Predicciones: <strong>${data.totalPredictions}</strong>
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/predictions" class="btn">Seguir prediciendo</a>
    </div>
    <div class="footer">
      <p>Este resumen se envía todos los lunes. <a href="${APP_URL}/predictions">Desactivar</a></p>
    </div>
  `))
}

export async function sendReengagementEmail(
  to: string,
  name: string,
  data: { daysInactive: number; streak: number; bestTurno: string },
): Promise<EmailResult> {
  return sendEmail(to, `Te extrañamos en Quiniela IA 😢`, wrap(`
    <div class="header">
      <div class="logo">😢</div>
      <h1 class="title">¡Te extrañamos!</h1>
      <p class="subtitle">Llevás ${data.daysInactive} días sin predecir</p>
    </div>
    <div class="card">
      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0">
        Tu racha de <strong>🔥 ${data.streak} días</strong> está en peligro.
        Volvé ahora para mantenerla activa y seguir subiendo de nivel.
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/predictions" class="btn">Volver a predecir</a>
    </div>
    <div class="card" style="text-align:center">
      <p style="color:#94a3b8;font-size:13px;margin:0">
        ⭐ Tu mejor turno: <strong>${data.bestTurno}</strong><br>
        🎯 Hay 5 sorteos hoy — ¡no los dejes pasar!
      </p>
    </div>
    <div class="footer">
      <p>Si no querés recibir estos emails, <a href="${APP_URL}/predictions?unsubscribe=email">desuscribite</a>.</p>
    </div>
  `))
}

export async function sendPremiumExpiryEmail(
  to: string,
  name: string,
  data: { daysLeft: number },
): Promise<EmailResult> {
  const urgency = data.daysLeft <= 1 ? "⚠️ Expira mañana" : `⏰ Expira en ${data.daysLeft} días`

  return sendEmail(to, urgency + " — Quiniela IA Premium", wrap(`
    <div class="header">
      <div class="logo">⭐</div>
      <h1 class="title">Tu Premium expira pronto</h1>
      <p class="subtitle">Te quedan ${data.daysLeft} día${data.daysLeft > 1 ? "s" : ""} de acceso premium</p>
    </div>
    <div class="card">
      <p style="color:#e2e8f0;font-size:14px;line-height:1.6;margin:0">
        Sin premium, tus predicciones se limitan a <strong>10 números de 2 cifras</strong>.
        Con premium tenés acceso ilimitado a <strong>3/4 cifras + redoblona</strong>.
      </p>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${APP_URL}/predictions" class="btn">Renovar Premium</a>
    </div>
    <div class="footer">
      <p>Renová antes de que expire para no perder tu racha 🔥</p>
    </div>
  `))
}
