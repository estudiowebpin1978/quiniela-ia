-- Migration: Fix materialized view refresh — add cooccurrence_matrix
-- refresh_all_prediction_stats() already refreshes draw_stats + markov_transitions
-- but was missing cooccurrence_matrix. Adding it here.
-- Also cleaning up disabled triggers from 20260828200000.

-- 1. Update refresh_all_prediction_stats to include all 3 MVs
CREATE OR REPLACE FUNCTION public.refresh_all_prediction_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.draw_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.markov_transitions;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.cooccurrence_matrix;
END;
$$;

-- 2. Update the api schema wrapper too
CREATE OR REPLACE FUNCTION api.refresh_all_prediction_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_all_prediction_stats();
END;
$$;

-- 3. Clean up disabled triggers from 20260828200000 (they were blocking upsert_draw)
DROP TRIGGER IF EXISTS trg_refresh_mvs_after_draw ON public.draws;
DROP TRIGGER IF EXISTS trg_refresh_draw_stats ON public.draws;
DROP TRIGGER IF EXISTS trg_refresh_predictions ON public.draws;
DROP TRIGGER IF EXISTS auto_refresh_predictions_3_4 ON public.draws;

-- 4. Remove old trigger functions that are no longer needed
DROP FUNCTION IF EXISTS public.trg_refresh_mvs_after_draw();
DROP FUNCTION IF EXISTS public.refresh_draw_stats();
DROP FUNCTION IF EXISTS public.trigger_refresh_predictions();
DROP FUNCTION IF EXISTS public.trg_refresh_predictions();
