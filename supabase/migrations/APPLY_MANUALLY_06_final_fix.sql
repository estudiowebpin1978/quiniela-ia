-- ============================================================
-- FINAL FIX: GRANTs directos + verificar omega_v6
-- ============================================================
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- ============================================================

-- 1. GRANTs on materialized views directly (PostgREST needs these)
GRANT SELECT ON public.draw_stats TO anon, authenticated, service_role;
GRANT SELECT ON public.markov_transitions TO anon, authenticated, service_role;
GRANT SELECT ON public.cooccurrence_matrix TO anon, authenticated, service_role;

-- 2. GRANTs on source_health table
GRANT SELECT, INSERT, UPDATE ON public.source_health TO service_role;

-- 3. Check omega_v6 exists
SELECT routine_name, routine_schema
FROM information_schema.routines
WHERE routine_name = 'calculate_omega_v6';

-- 4. If omega_v6 is in public schema, create api wrapper
CREATE OR REPLACE FUNCTION api.calculate_omega_v6(p_turno TEXT, p_tier TEXT)
RETURNS SETOF json AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.calculate_omega_v6(p_turno, p_tier);
END;
$$ LANGUAGE plpgsql STABLE;

-- 5. Also ensure the public version exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.routines
    WHERE routine_name = 'calculate_omega_v6' AND routine_schema = 'public'
  ) THEN
    RAISE NOTICE 'calculate_omega_v6 not found in public schema - check migration history';
  END IF;
END $$;
