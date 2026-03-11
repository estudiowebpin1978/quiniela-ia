// app/api/webhooks/uala/route.ts
// Webhook receptor de pagos Ualá → activa acceso Premium en Supabase
//
// Ualá envía un POST con payload JSON cuando el pago es aprobado.
// Este endpoint verifica la firma HMAC, registra el pago y activa
// el rol premium del usuario en user_profiles.
//
// Configurar en Ualá Dashboard: https://developers.uala.com.ar
// URL del webhook: https://tu-dominio.com/api/webhooks/uala

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ─── Supabase admin client (service_role, nunca exponer al frontend) ───────────
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase credentials missing in environment");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ─── Config ────────────────────────────────────────────────────────────────────
const UALA_WEBHOOK_SECRET = process.env.UALA_WEBHOOK_SECRET ?? "";
const PREMIUM_DAYS        = 30;   // días de acceso por pago
const PREMIUM_PRICE_ARS   = 1500; // precio mínimo aceptado en centavos (ARS 15.00)

// ─── Tipos Ualá ────────────────────────────────────────────────────────────────
interface UalaPayload {
  event:        string;          // "payment.approved" | "payment.rejected" | etc.
  transaction_id: string;        // ID único de la tx
  amount:       number;          // monto en centavos
  currency:     string;          // "ARS"
  status:       string;          // "approved" | "rejected" | "pending"
  payer: {
    email:      string;
    name?:      string;
    cuit?:      string;
  };
  metadata?:    Record<string, string>; // datos adicionales del merchant
  created_at:   string;          // ISO 8601
}

// ─── Verificación HMAC-SHA256 ──────────────────────────────────────────────────
function verifySignature(
  body: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature || !secret) return false;
  try {
    const expected = crypto
      .createHmac("sha256", secret)
      .update(body, "utf8")
      .digest("hex");
    // Comparación time-safe para evitar timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected,  "hex")
    );
  } catch {
    return false;
  }
}

// ─── Buscar usuario por email ──────────────────────────────────────────────────
async function findUserByEmail(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  email: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("email", email)
    .limit(1)
    .single();

  if (error || !data) return null;
  return data.id;
}

// ─── Activar Premium ────────────────────────────────────────────────────────────
async function activatePremium(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  txId: string
): Promise<void> {
  const { error } = await supabase.rpc("activate_premium", {
    p_uala_tx_id: txId,
    p_user_id:    userId,
    p_days:       PREMIUM_DAYS,
  });
  if (error) throw new Error(`activate_premium RPC failed: ${error.message}`);
}

// ─── Registrar pago ─────────────────────────────────────────────────────────────
async function recordPayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  payload: UalaPayload,
  userId: string | null
): Promise<void> {
  await supabase.from("uala_payments").upsert(
    {
      uala_tx_id:   payload.transaction_id,
      user_id:      userId,
      email:        payload.payer.email,
      amount_cents: payload.amount,
      currency:     payload.currency,
      status:       "received",
      raw_payload:  payload,
    },
    { onConflict: "uala_tx_id" }
  );
}

// ─── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Verificar firma HMAC (seguridad)
  const signature = req.headers.get("x-uala-signature");
  if (UALA_WEBHOOK_SECRET && !verifySignature(rawBody, signature, UALA_WEBHOOK_SECRET)) {
    console.error("[Ualá Webhook] Firma inválida");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Parsear payload
  let payload: UalaPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  console.log(`[Ualá Webhook] Evento: ${payload.event} | TX: ${payload.transaction_id}`);

  // 3. Solo procesar pagos aprobados
  if (payload.event !== "payment.approved" || payload.status !== "approved") {
    console.log(`[Ualá Webhook] Ignorando evento: ${payload.event} / ${payload.status}`);
    return NextResponse.json({ received: true, action: "ignored" });
  }

  // 4. Validar monto mínimo
  if (payload.amount < PREMIUM_PRICE_ARS) {
    console.warn(`[Ualá Webhook] Monto insuficiente: ${payload.amount} centavos`);
    return NextResponse.json({ error: "Amount too low" }, { status: 422 });
  }

  // 5. Inicializar Supabase
  let supabase: ReturnType<typeof getSupabaseAdmin>;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    console.error("[Ualá Webhook] Supabase no configurado:", e);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // 6. Buscar usuario por email
  const userId = await findUserByEmail(supabase, payload.payer.email);

  // 7. Registrar pago (siempre, aunque el usuario no exista aún)
  await recordPayment(supabase, payload, userId);

  // 8. Activar premium si encontramos el usuario
  if (userId) {
    try {
      await activatePremium(supabase, userId, payload.transaction_id);
      console.log(`[Ualá Webhook] ✓ Premium activado: ${payload.payer.email} por ${PREMIUM_DAYS} días`);
    } catch (e) {
      console.error("[Ualá Webhook] Error activando premium:", e);
      return NextResponse.json({ error: "Premium activation failed" }, { status: 500 });
    }
  } else {
    // Usuario no registrado aún: el pago queda en "received"
    // Cuando se registre, debe usar el mismo email para matchear
    console.warn(`[Ualá Webhook] Usuario no encontrado: ${payload.payer.email} — pago guardado`);
  }

  return NextResponse.json({
    received:    true,
    transaction: payload.transaction_id,
    premium:     userId ? "activated" : "pending_user_registration",
    days:        PREMIUM_DAYS,
  });
}

// Solo aceptar POST
export async function GET() {
  return NextResponse.json(
    { error: "Method not allowed. This endpoint only accepts POST requests from Ualá." },
    { status: 405 }
  );
}
