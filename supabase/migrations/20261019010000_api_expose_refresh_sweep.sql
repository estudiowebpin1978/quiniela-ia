-- Migración aplicada directamente a la BD remota el 2026-10-19 (auditoría
-- módulos): wrappers en el schema 'api' (expuesto por PostgREST) para las RPCs
-- usadas por el pipeline serverless. Root cause: solo existían en 'public' →
-- 404 PGRST202 en serverless y draw_stats vencida desde el 2026-10-14.
--
-- Efectos: cron-scrape/cron-verify-catchup/tareas-auxiliares pueden llamarlas;
-- el refresh lleva gate de 12 h + SET LOCAL statement_timeout '2min' (la MV
-- tarda ~107 s).
-- Reversión: drop function api.refresh_draw_stats_rpc(); drop function api.sweep_expired_predictions();

create or replace function api.refresh_draw_stats_rpc()
returns void
language plpgsql
security definer
set search_path = public
as #BEGIN PERFORM public.refresh_draw_stats_rpc(); END#;
revoke all on function api.refresh_draw_stats_rpc() from public;
grant execute on function api.refresh_draw_stats_rpc() to anon, authenticated, service_role;

create or replace function api.sweep_expired_predictions()
returns integer
language plpgsql
security definer
set search_path = public
as #BEGIN RETURN public.sweep_expired_predictions(); END#;
revoke all on function api.sweep_expired_predictions() from public;
grant execute on function api.sweep_expired_predictions() to anon, authenticated, service_role;
