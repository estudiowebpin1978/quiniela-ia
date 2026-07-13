/**
 * Cron job: envía notificación push 1 hora antes de cada sorteo.
 * 
 * Horarios (hora Argentina):
 *   Previa    10:15 → notifica 9:15
 *   Primera   12:00 → notifica 11:00
 *   Matutina  15:00 → notifica 14:00
 *   Vespertina 18:00 → notifica 17:00
 *   Nocturna  21:00 → notifica 20:00
 * 
 * Ejecutar cada 15 min con cron-job.org o similar.
 * POST /api/cron-push?secret=XXX
 */

import { NextRequest, NextResponse } from "next/server"
import logger from "@/lib/logger"
import { sendPushToAll, getSubscriptionCount } from "@/lib/push/send"

const CRON_SECRET = process.env.CRON_SECRET || ""

const TURNOS = [
  { nombre: "Previa",     hora: 10, min: 15, notifHora: 9,  notifMin: 15, emoji: "🔮", nums: "2 cifras" },
  { nombre: "Primera",    hora: 12, min: 0,  notifHora: 11, notifMin: 0,  emoji: "🎯", nums: "2 cifras" },
  { nombre: "Matutina",   hora: 15, min: 0,  notifHora: 14, notifMin: 0,  emoji: "☀️", nums: "2 cifras" },
  { nombre: "Vespertina", hora: 18, min: 0,  notifHora: 17, notifMin: 0,  emoji: "🌅", nums: "2 cifras" },
  { nombre: "Nocturna",   hora: 21, min: 0,  notifHora: 20, notifMin: 0,  emoji: "🌙", nums: "2 cifras" },
]

function getArgentinaTime(): Date {
  const now = new Date()
  const argentina = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }))
  return argentina
}

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

export async function GET(req: NextRequest) {
  // Validar secret
  const { searchParams } = new URL(req.url)
  const secret = searchParams.get("secret") || req.headers.get("authorization")?.replace("Bearer ", "") || ""
  if (CRON_SECRET && secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  const now = getArgentinaTime()
  const currentHour = now.getHours()
  const currentMin = now.getMinutes()

  // Buscar turno que coincide con la hora de notificación (±7 min window)
  const turnoActual = TURNOS.find(t => {
    const diffMin = Math.abs((currentHour * 60 + currentMin) - (t.notifHora * 60 + t.notifMin))
    return diffMin <= 7
  })

  if (!turnoActual) {
    return NextResponse.json({
      ok: true,
      action: "skip",
      message: `No hay notificación pendiente ahora (${pad(currentHour)}:${pad(currentMin)})`,
      nextTurnos: TURNOS.map(t => ({
        nombre: t.nombre,
        notifica: `${pad(t.notifHora)}:${pad(t.notifMin)}`,
        sorteo: `${pad(t.hora)}:${pad(t.min)}`,
      })),
    })
  }

  // Verificar suscriptores
  const subCount = await getSubscriptionCount()
  if (subCount === 0) {
    return NextResponse.json({
      ok: true,
      action: "skip",
      message: "No hay suscriptores para notificar",
    })
  }

  // Calcular tiempo restante
  const diffMin = (turnoActual.hora * 60 + turnoActual.min) - (currentHour * 60 + currentMin)
  const horasFaltan = Math.floor(diffMin / 60)
  const minsFaltan = diffMin % 60
  const tiempoFalta = horasFaltan > 0 ? `${horasFaltan}h ${minsFaltan}min` : `${minsFaltan} minutos`

  // Construir mensaje
  const title = `${turnoActual.emoji} Sorteo ${turnoActual.nombre} en ${tiempoFalta}`
  const body = `Faltan ${tiempoFalta} para el sorteo de las ${pad(turnoActual.hora)}:${pad(turnoActual.min)}.\n\nGenerá tu análisis ahora y aumentá tus chances de ganar.`

  // Enviar push
  const result = await sendPushToAll({
    title,
    body,
    url: `/predictions?sorteo=${turnoActual.nombre.toLowerCase()}`,
    data: {
      turno: turnoActual.nombre.toLowerCase(),
      type: "sorteo_reminder",
      tiempoFalta,
    },
  })

  // Log para debugging
  logger.info(`[cron-push] ${now.toISOString()} → ${turnoActual.nombre}: sent=${result.sent}, failed=${result.failed}, subs=${subCount}`)

  return NextResponse.json({
    ok: true,
    action: "sent",
    turno: turnoActual.nombre,
    enviado: result.sent,
    fallos: result.failed,
    suscriptores: subCount,
    tiempoFalta,
    proximoTurno: TURNOS.find(t => {
      const next = (currentHour * 60 + currentMin) < (t.notifHora * 60 + t.notifMin)
      return next
    })?.nombre || TURNOS[0].nombre,
  })
}
