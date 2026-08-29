-- Fix: Refresh materialized views that feed V7 prediction engine
-- ROOT CAUSE: trigger_refresh_predictions() was a no-op — draw_stats and
-- markov_transitions were never refreshed, so V7 always returned stale predictions.

-- 1. Create a proper refresh function (callable from JS + trigger)
CREATE OR REPLACE FUNCTION public.refresh_all_prediction_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY draw_stats;
  REFRESH MATERIALIZED VIEW CONCURRENTLY markov_transitions;
END;
$$;

-- 2. Fix the no-op trigger to actually refresh stats
CREATE OR REPLACE FUNCTION public.trigger_refresh_predictions()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Refresh materialized views so V7 engine sees fresh stats
  PERFORM public.refresh_all_prediction_stats();
  RETURN NEW;
END;
$$;

-- 3. Also expose via api schema for PostgREST access from JS
CREATE OR REPLACE FUNCTION api.refresh_all_prediction_stats()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_all_prediction_stats();
END;
$$;
