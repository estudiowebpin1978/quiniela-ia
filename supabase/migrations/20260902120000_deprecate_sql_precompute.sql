-- Deprecate SQL-only precompute_prediction (V6-only) in favor of TS cron-precompute (V6+V7+ML).
-- Source of truth: GET /api/cron-precompute → predictions_cache (engine_version = meta-ensemble-v1)

CREATE OR REPLACE FUNCTION public.precompute_prediction(
  p_turno TEXT,
  p_date DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'deprecated', true,
    'error', 'precompute_prediction SQL está deprecada. Usar /api/cron-precompute (V6+V7+ML meta-ensemble).',
    'turno', p_turno,
    'date', COALESCE(p_date, CURRENT_DATE),
    'use_instead', '/api/cron-precompute'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.precompute_all_turnos()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN jsonb_build_object(
    'ok', false,
    'deprecated', true,
    'error', 'precompute_all_turnos deprecada. Programar cron-job.org → /api/cron-precompute',
    'use_instead', '/api/cron-precompute'
  );
END;
$$;

COMMENT ON FUNCTION public.precompute_prediction IS
  'DEPRECATED — use /api/cron-precompute (meta-ensemble V6+V7+ML). SQL-only V6 caused divergent predictions.';

COMMENT ON FUNCTION public.precompute_all_turnos IS
  'DEPRECATED — use /api/cron-precompute for all turnos.';
