-- Calibración: calcular tasas de acierto observadas desde backtest real
CREATE OR REPLACE FUNCTION public.calibration_summary(
  p_turno TEXT DEFAULT NULL
)
RETURNS TABLE (
  turno TEXT,
  engine_name TEXT,
  total_tests INTEGER,
  hits INTEGER,
  near_misses INTEGER,
  hit_rate NUMERIC,
  near_miss_rate NUMERIC,
  combined_rate NUMERIC,
  last_test_date DATE
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    w.turno,
    w.engine_name,
    COUNT(*)::INTEGER AS total_tests,
    SUM(CASE WHEN w.is_hit THEN 1 ELSE 0 END)::INTEGER AS hits,
    SUM(CASE WHEN w.is_near_miss THEN 1 ELSE 0 END)::INTEGER AS near_misses,
    ROUND((SUM(CASE WHEN w.is_hit THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC), 4) AS hit_rate,
    ROUND((SUM(CASE WHEN w.is_near_miss THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC), 4) AS near_miss_rate,
    ROUND(
      ((SUM(CASE WHEN w.is_hit THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 0.8 +
       (SUM(CASE WHEN w.is_near_miss THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) * 0.2)::NUMERIC, 4) AS combined_rate,
    MAX(w.test_date) AS last_test_date
  FROM public.walkforward_results w
  WHERE (p_turno IS NULL OR w.turno = p_turno)
  GROUP BY w.turno, w.engine_name
  ORDER BY w.turno, w.engine_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calibration_summary(TEXT) TO service_role;
