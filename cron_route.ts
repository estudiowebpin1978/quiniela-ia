// app/api/cron/route.ts
// Handler del cron job de Vercel — valida el secret antes de ejecutar

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
// Importante: marcar como dynamic para que Vercel no lo cachee
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // ── 1. Validar el secret del cron ─────────────────────────────────────────
  const secret = req.nextUrl.searchParams.get("secret");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error("[cron] CRON_SECRET no configurado en variables de entorno");
    return NextResponse.json({ error: "Configuración incompleta" }, { status: 500 });
  }

  if (!secret || secret !== expectedSecret) {
    console.warn("[cron] Intento de acceso con secret inválido");
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // ── 2. Inicializar Supabase con service role (escritura) ───────────────────
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const results = {
    processed: 0,
    errors: 0,
    skipped: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    // ── 3. Buscar sorteos pendientes de procesar ─────────────────────────────
    const { data: pending, error: fetchError } = await supabase
      .from("pending_draws")
      .select("*")
      .eq("status", "pending")
      .lte("retries", 3)           // No reintentar más de 3 veces
      .order("draw_date", { ascending: false })
      .limit(20);

    if (fetchError) {
      console.error("[cron] Error al obtener pending_draws:", fetchError);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!pending || pending.length === 0) {
      console.log("[cron] No hay sorteos pendientes");
      return NextResponse.json({ ...results, message: "Sin trabajo pendiente" });
    }

    // ── 4. Procesar cada sorteo pendiente ────────────────────────────────────
    for (const draw of pending) {
      try {
        // Marcar como "en proceso" para evitar doble procesamiento
        await supabase
          .from("pending_draws")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", draw.id);

        const rawData = draw.raw_data as Record<string, unknown> | null;

        // Validar que los datos son suficientes para insertar
        if (!rawData || !rawData.pos_1) {
          await supabase
            .from("pending_draws")
            .update({
              status: "error",
              error_msg: "raw_data incompleto o sin pos_1",
              updated_at: new Date().toISOString(),
            })
            .eq("id", draw.id);
          results.skipped++;
          continue;
        }

        // Upsert en la tabla draws principal
        const { error: upsertError } = await supabase
          .from("draws")
          .upsert(
            {
              draw_date: draw.draw_date,
              sorteo: draw.sorteo,
              ...rawData, // spread de pos_1..pos_20, source, raw_html
            },
            { onConflict: "draw_date,sorteo" }
          );

        if (upsertError) {
          throw new Error(upsertError.message);
        }

        // Marcar como completado
        await supabase
          .from("pending_draws")
          .update({ status: "done", updated_at: new Date().toISOString() })
          .eq("id", draw.id);

        results.processed++;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[cron] Error procesando draw ${draw.id}:`, message);

        // Incrementar retry count y marcar error
        await supabase
          .from("pending_draws")
          .update({
            status: draw.retries >= 3 ? "error" : "pending",
            retries: (draw.retries ?? 0) + 1,
            error_msg: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", draw.id);

        results.errors++;
      }
    }

    console.log("[cron] Completado:", results);
    return NextResponse.json(results);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron] Error general:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
