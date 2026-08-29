-- ============================================================
-- FIX: omega_v6 wrapper + final permissions
-- ============================================================
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- ============================================================

-- 1. Drop the wrong omega_v6 wrapper
DROP FUNCTION IF EXISTS api.calculate_omega_v6(TEXT, TEXT);

-- 2. Create correct wrapper matching the original signature
CREATE OR REPLACE FUNCTION api.calculate_omega_v6(
  p_turno TEXT,
  p_tier TEXT DEFAULT 'free',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  prediccion_2cifras TEXT,
  prediccion_3cifras JSONB,
  prediccion_4cifras JSONB,
  redoblona JSONB,
  factor_attribution JSONB
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT * FROM public.calculate_omega_v6(p_turno, p_tier, p_date);
END;
$$;

-- 3. Verify it works (run this query to test)
-- SELECT * FROM api.calculate_omega_v6('Matutina', 'free', CURRENT_DATE) LIMIT 5;
