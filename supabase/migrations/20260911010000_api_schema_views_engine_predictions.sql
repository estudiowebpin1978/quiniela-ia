-- Migration: Expose engine_performance, engine_predictions_log, predictions_cache
-- via api schema for PostgREST access.
--
-- ROOT CAUSE: PostgREST only exposes the "api" schema. These tables were created
-- in "public" schema but never got api schema views, making them invisible to the
-- Supabase JS client (which goes through PostgREST). This caused:
--   - engine_performance reads to always fail → fallback weights (40/35/25)
--   - engine_predictions_log writes to silently fail → no performance data
--   - predictions_cache reads/writes to fail → predictions API falls back to live V6
--
-- FIX: Create api schema views + SECURITY DEFINER RPCs for write operations.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. VIEWS (read access via PostgREST)
-- ═══════════════════════════════════════════════════════════════════════════════

-- engine_performance: read access for loadEngineWeightsDecayed()
CREATE OR REPLACE VIEW api.engine_performance AS
  SELECT turno, engine_name, win_rate_last_10, hit_count, near_miss_count,
         total_runs, updated_at
  FROM public.engine_performance;

-- engine_predictions_log: read access for diagnostics
CREATE OR REPLACE VIEW api.engine_predictions_log AS
  SELECT id, draw_id, turno, engine_name, predicted_numbers, created_at
  FROM public.engine_predictions_log;

-- predictions_cache: read access for predictions API + frontend
CREATE OR REPLACE VIEW api.predictions_cache AS
  SELECT id, game_id, date, turno, numeros_2, numeros_3, numeros_4, redoblona,
         engine_version, v6_weight, v7_weight, ml_weight, confidence,
         agreement_score, factor_attribution, computed_at, updated_at
  FROM public.predictions_cache;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. WRITE FUNCTIONS (SECURITY DEFINER for upsert/insert via PostgREST)
-- ═══════════════════════════════════════════════════════════════════════════════

-- predictions_cache_upsert: called by cron-precompute and cron-autopilot
CREATE OR REPLACE FUNCTION api.predictions_cache_upsert(
  p_game_id UUID,
  p_date DATE,
  p_turno TEXT,
  p_numeros_2 JSONB,
  p_numeros_3 JSONB DEFAULT NULL,
  p_numeros_4 JSONB DEFAULT NULL,
  p_redoblona JSONB DEFAULT NULL,
  p_engine_version TEXT DEFAULT 'meta-ensemble-v1',
  p_v6_weight FLOAT DEFAULT 0.40,
  p_v7_weight FLOAT DEFAULT 0.35,
  p_ml_weight FLOAT DEFAULT 0.25,
  p_confidence FLOAT DEFAULT 0,
  p_agreement_score FLOAT DEFAULT 0,
  p_computed_at TIMESTAMPTZ DEFAULT NOW(),
  p_updated_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.predictions_cache (
    game_id, date, turno, numeros_2, numeros_3, numeros_4, redoblona,
    engine_version, v6_weight, v7_weight, ml_weight,
    confidence, agreement_score, computed_at, updated_at
  ) VALUES (
    p_game_id, p_date, p_turno, p_numeros_2, p_numeros_3, p_numeros_4, p_redoblona,
    p_engine_version, p_v6_weight, p_v7_weight, p_ml_weight,
    p_confidence, p_agreement_score, p_computed_at, p_updated_at
  )
  ON CONFLICT (game_id, date, turno)
  DO UPDATE SET
    numeros_2 = EXCLUDED.numeros_2,
    numeros_3 = EXCLUDED.numeros_3,
    numeros_4 = EXCLUDED.numeros_4,
    redoblona = EXCLUDED.redoblona,
    engine_version = EXCLUDED.engine_version,
    v6_weight = EXCLUDED.v6_weight,
    v7_weight = EXCLUDED.v7_weight,
    ml_weight = EXCLUDED.ml_weight,
    confidence = EXCLUDED.confidence,
    agreement_score = EXCLUDED.agreement_score,
    computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- engine_predictions_log_upsert: called by cron-precompute to log raw predictions
CREATE OR REPLACE FUNCTION api.engine_predictions_log_upsert(
  p_draw_id UUID,
  p_turno TEXT,
  p_engine_name TEXT,
  p_predicted_numbers INT[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.engine_predictions_log (draw_id, turno, engine_name, predicted_numbers)
  VALUES (p_draw_id, p_turno, p_engine_name, p_predicted_numbers)
  ON CONFLICT (draw_id, engine_name)
  DO UPDATE SET
    predicted_numbers = EXCLUDED.predicted_numbers,
    turno = EXCLUDED.turno;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. RPC WRAPPERS (expose public schema RPCs via api schema)
-- ═══════════════════════════════════════════════════════════════════════════════

-- recalculate_engine_performance: batch recalc from engine_predictions_log
CREATE OR REPLACE FUNCTION api.recalculate_engine_performance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.recalculate_engine_performance();
END;
$$;

-- update_engine_performance: incremental single-engine update
CREATE OR REPLACE FUNCTION api.update_engine_performance(
  p_engine_name TEXT,
  p_hit BOOLEAN,
  p_near_miss BOOLEAN,
  p_turno TEXT DEFAULT 'ALL'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.update_engine_performance(p_engine_name, p_hit, p_near_miss, p_turno);
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. GRANTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Views: service_role can read (anon/authenticated access controlled by RLS on underlying tables)
GRANT SELECT ON api.engine_performance TO service_role;
GRANT SELECT ON api.engine_predictions_log TO service_role;
GRANT SELECT ON api.predictions_cache TO service_role;

-- Write functions: service_role only
GRANT EXECUTE ON FUNCTION api.predictions_cache_upsert(UUID, DATE, TEXT, JSONB, JSONB, JSONB, JSONB, TEXT, FLOAT, FLOAT, FLOAT, FLOAT, FLOAT, TIMESTAMPTZ, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION api.engine_predictions_log_upsert(UUID, TEXT, TEXT, INT[]) TO service_role;
GRANT EXECUTE ON FUNCTION api.recalculate_engine_performance() TO service_role;
GRANT EXECUTE ON FUNCTION api.update_engine_performance(TEXT, BOOLEAN, BOOLEAN, TEXT) TO service_role;
