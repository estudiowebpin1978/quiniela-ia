-- Migración aplicada directamente a la BD remota el 2026-10-19/20 (auditoría
-- módulos): wrappers en el schema 'api' (expuesto por PostgREST) para las RPCs
-- usadas por el pipeline serverless. Root cause: solo existían en 'public' →
-- 404 PGRST202 en serverless y draw_stats vencida desde el 2026-10-14.
--
-- Efectos: cron-scrape/cron-verify-catchup/tareas-auxiliares pueden llamarlas;
-- el refresh lleva gate de 12 h + SET LOCAL statement_timeout '2min' (la MV
-- tarda ~107 s). Registra duración en cron_logs vía log_cron_execution.
-- Reversión: drop function api.refresh_draw_stats_rpc(); drop function api.sweep_expired_predictions();

create or replace function api.refresh_draw_stats_rpc()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max timestamptz;
  v_start timestamptz := clock_timestamp();
  v_duration interval;
begin
  select max(computed_at)
    into v_max
    from draw_stats;

  -- Gate: si la MV se refrescó hace menos de 12 h, no refresca (evita el
  -- refresh pesado —~107 s— en cada tick de cron-scrape).
  if v_max is not null and now() - v_max < interval '12 hours' then
    return;
  end if;

  set local statement_timeout = '2min';
  perform public.refresh_draw_stats_rpc();

  -- Log duration if logCronExecution is available (best effort)
  v_duration := clock_timestamp() - v_start;
  begin
    perform public.log_cron_execution('refresh_draw_stats_rpc', jsonb_build_object('duration_ms', extract(epoch from v_duration) * 1000), v_start);
  exception when undefined_function then
    -- log_cron_execution may not be available in this session; ignore
  end;
end
$$;

revoke all on function api.refresh_draw_stats_rpc() from public;
grant execute on function api.refresh_draw_stats_rpc() to anon, authenticated, service_role;

create or replace function api.sweep_expired_predictions()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.sweep_expired_predictions();
end
$$;

revoke all on function api.sweep_expired_predictions() from public;
grant execute on function api.sweep_expired_predictions() to anon, authenticated, service_role;