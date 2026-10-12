-- Migración: refresh_draw_stats_rpc → SECURITY DEFINER.
--
-- Problema (auditoría 2026-10-12): la función era SECURITY INVOKER, así que
-- cuando la app (service_role) la invocaba vía PostgREST ejecutaba como
-- service_role y "REFRESH MATERIALIZED VIEW CONCURRENTLY" FALLABA (requiere
-- ser dueño de la MV). El código de cron-scrape no chequeaba .error → fallo
-- silencioso: draw_stats quedó ~2 semanas vencida y /api/health marcaba
-- DRAW_STATS FAILED.
--
-- Fix: SECURITY DEFINER con search_path explícito (la ejecuta el dueño,
-- postgres), revocando el acceso público y concediéndolo solo a service_role
-- (único llamador legítimo: cron-scrape).
--
-- Idempotente y reversible:
--   Reversión: CREATE OR REPLACE ... SECURITY INVOKER (quitar SECURITY
--   DEFINER y restaurar grants públicos).
--
-- APLICAR A PROD: requiere confirmación explícita (cambio de esquema).

CREATE OR REPLACE FUNCTION public.refresh_draw_stats_rpc()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY draw_stats;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refresh_draw_stats_rpc() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.refresh_draw_stats_rpc() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refresh_draw_stats_rpc() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_draw_stats_rpc() TO service_role;
