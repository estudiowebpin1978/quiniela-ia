-- ============================================================
-- FIX: Expose new objects via api schema views for PostgREST
-- ============================================================
-- PostgREST only exposes the "api" schema.
-- All new tables/views/RPCs must have api schema views.
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- ============================================================

-- 1. API views for materialized views (PostgREST can read these)
CREATE OR REPLACE VIEW api.draw_stats AS SELECT * FROM public.draw_stats;
CREATE OR REPLACE VIEW api.markov_transitions AS SELECT * FROM public.markov_transitions;
CREATE OR REPLACE VIEW api.cooccurrence_matrix AS SELECT * FROM public.cooccurrence_matrix;

-- 2. API view for source_health table
CREATE OR REPLACE VIEW api.source_health AS SELECT * FROM public.source_health;

-- 3. Re-create RPCs in api schema (PostgREST needs them here)
CREATE OR REPLACE FUNCTION api.get_draw_stats(p_turno TEXT)
RETURNS TABLE (
  num INT, global_freq BIGINT, freq_7 BIGINT, freq_30 BIGINT,
  freq_90 BIGINT, last_seen_rank BIGINT, avg_gap DOUBLE PRECISION, total_draws BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ds.num::INT, ds.global_freq, ds.freq_7, ds.freq_30,
    ds.freq_90, ds.last_seen_rank, ds.avg_gap, ds.total_draws
  FROM public.draw_stats ds WHERE ds.turno = p_turno ORDER BY ds.num;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION api.get_markov_transitions(p_turno TEXT)
RETURNS TABLE (from_num INT, to_num INT, transition_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT mt.from_num::INT, mt.to_num::INT, mt.transition_count
  FROM public.markov_transitions mt WHERE mt.turno = p_turno;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION api.get_cooccurrences(p_turno TEXT)
RETURNS TABLE (num_a INT, num_b INT, cooccurrence_count BIGINT) AS $$
BEGIN
  RETURN QUERY
  SELECT cm.num_a::INT, cm.num_b::INT, cm.cooccurrence_count
  FROM public.cooccurrence_matrix cm WHERE cm.turno = p_turno;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION api.is_source_quarantined(p_source TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  SELECT quarantined_until INTO v_until
  FROM public.source_health WHERE source = p_source;
  IF v_until IS NULL THEN RETURN FALSE; END IF;
  RETURN v_until > NOW();
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION api.get_source_health()
RETURNS TABLE (
  source TEXT, consecutive_failures INT, quarantined_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ,
  total_failures INT, total_successes INT, success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT sh.source, sh.consecutive_failures, sh.quarantined_until,
    sh.last_failure_at, sh.last_success_at, sh.total_failures, sh.total_successes,
    CASE WHEN (sh.total_failures + sh.total_successes) > 0
      THEN ROUND(sh.total_successes::NUMERIC / (sh.total_failures + sh.total_successes) * 100, 1)
      ELSE 0 END AS success_rate
  FROM public.source_health sh ORDER BY sh.source;
END;
$$ LANGUAGE plpgsql STABLE;
