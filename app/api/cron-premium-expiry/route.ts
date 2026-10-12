import { NextRequest, NextResponse } from "next/server"
import { validateCronAuth, unauthorizedResponse, logCronExecution } from "@/lib/cron/auth"
import { procesarVencimientosPremium } from "@/lib/premium/vencimientos"

/**
 * GET /api/cron-premium-expiry — vencimientos Premium (downgrade + avisos).
 *
 * La lógica vive en lib/premium/vencimientos.ts para poder ejecutarla desde
 * dos orígenes con el mismo comportamiento:
 *  1. esta ruta (Cron de Vercel / llamada manual con CRON_SECRET), y
 *  2. lib/cron/tareas-auxiliares, acoplado al tick vivo de cron-verify
 *     (auditoría 2026-10-12: el Cron de Vercel está registrado pero no
 *     recibía invocaciones — esta vía garantiza la cadencia diaria).
 */
export async function GET(req: NextRequest) {
  const t0 = Date.now()
  const auth = await validateCronAuth(req)
  if (!auth.authorized) return unauthorizedResponse()

  const r = await procesarVencimientosPremium()
  logCronExecution("cron-premium-expiry", { ...r }, t0)
  return NextResponse.json(r, { status: r.ok ? 200 : 500 })
}
