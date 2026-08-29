-- ============================================================
-- FIX: Type mismatch + RLS for new objects
-- ============================================================
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- ============================================================

-- 1. Fix get_draw_stats type mismatch (avg_gap is numeric, needs cast)
CREATE OR REPLACE FUNCTION api.get_draw_stats(p_turno TEXT)
RETURNS TABLE (
  num INT, global_freq BIGINT, freq_7 BIGINT, freq_30 BIGINT,
  freq_90 BIGINT, last_seen_rank BIGINT, avg_gap DOUBLE PRECISION, total_draws BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ds.num::INT, ds.global_freq, ds.freq_7, ds.freq_30,
    ds.freq_90, ds.last_seen_rank, ds.avg_gap::DOUBLE PRECISION, ds.total_draws
  FROM public.draw_stats ds WHERE ds.turno = p_turno ORDER BY ds.num;
END;
$$ LANGUAGE plpgsql STABLE;

-- 2. Also fix the public schema version
CREATE OR REPLACE FUNCTION public.get_draw_stats(p_turno TEXT)
RETURNS TABLE (
  num INT, global_freq BIGINT, freq_7 BIGINT, freq_30 BIGINT,
  freq_90 BIGINT, last_seen_rank BIGINT, avg_gap DOUBLE PRECISION, total_draws BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT ds.num::INT, ds.global_freq, ds.freq_7, ds.freq_30,
    ds.freq_90, ds.last_seen_rank, ds.avg_gap::DOUBLE PRECISION, ds.total_draws
  FROM public.draw_stats ds WHERE ds.turno = p_turno ORDER BY ds.num;
END;
$$ LANGUAGE plpgsql STABLE;

-- 3. Disable RLS on source_health (PostgREST uses anon role, service_role key bypasses RLS anyway)
ALTER TABLE public.source_health DISABLE ROW LEVEL SECURITY;

-- 4. Grant access to anon and authenticated for PostgREST
GRANT SELECT ON api.source_health TO anon, authenticated;
GRANT SELECT ON api.draw_stats TO anon, authenticated;
GRANT SELECT ON api.markov_transitions TO anon, authenticated;
GRANT SELECT ON api.cooccurrence_matrix TO anon, authenticated;

-- 5. Grant EXECUTE on RPCs
GRANT EXECUTE ON FUNCTION api.get_draw_stats(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_markov_transitions(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_cooccurrences(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.is_source_quarantined(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION api.get_source_health() TO anon, authenticated;
