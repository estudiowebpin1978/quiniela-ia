-- Allow the stale draw_stats materialized view to complete its refresh.
CREATE OR REPLACE FUNCTION api.refresh_draw_stats_rpc()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max TIMESTAMPTZ;
  v_start TIMESTAMPTZ := clock_timestamp();
  v_duration INTERVAL;
BEGIN
  SELECT max(computed_at)
    INTO v_max
    FROM draw_stats;

  IF v_max IS NOT NULL AND now() - v_max < interval '12 hours' THEN
    RETURN;
  END IF;

  SET LOCAL statement_timeout = '4min';
  PERFORM public.refresh_draw_stats_rpc();

  v_duration := clock_timestamp() - v_start;
  BEGIN
    PERFORM public.log_cron_execution(
      'refresh_draw_stats_rpc',
      jsonb_build_object('duration_ms', extract(epoch FROM v_duration) * 1000),
      v_start
    );
  EXCEPTION WHEN undefined_function THEN
    NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION api.refresh_draw_stats_rpc() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION api.refresh_draw_stats_rpc() TO anon, authenticated, service_role;
