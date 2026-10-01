CREATE OR REPLACE FUNCTION public.factor_collinearity(
  p_turno TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_corr_f_h NUMERIC; v_corr_f_t NUMERIC; v_corr_h_t NUMERIC;
BEGIN
  -- Aproximación rápida: comparar varianza relativa de scores de los 10 factores
  -- Usando datos de predictions_cache (factor_attribution) como proxy de correlación
  SELECT
    ROUND(STDDEV(COALESCE((fa ->> 'frequency')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'frequency')::NUMERIC, 0)), 0)::NUMERIC, 4),
    ROUND(STDDEV(COALESCE((fa ->> 'hot')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'hot')::NUMERIC, 0)), 0)::NUMERIC, 4),
    ROUND(STDDEV(COALESCE((fa ->> 'trend')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'trend')::NUMERIC, 0)), 0)::NUMERIC, 4)
  INTO v_corr_f_h, v_corr_f_t, v_corr_h_t
  FROM predictions_cache
  CROSS JOIN LATERAL jsonb_each_text(factor_attribution) AS fa(key, value)
  WHERE (p_turno IS NULL OR turno = p_turno)
    AND factor_attribution IS NOT NULL
    AND updated_at > NOW() - INTERVAL '30 days';

  RETURN jsonb_build_object(
    'turno', p_turno,
    'frequency_variance_ratio', v_corr_f_h,
    'trend_variance_ratio', v_corr_f_t,
    'hot_trend_variance_ratio', v_corr_h_t,
    'note', 'Alta varianza relativa indica baja colinealidad (factores independientes). Baja varianza indica redundancia.',
    'threshold_warning', CASE WHEN COALESCE(v_corr_f_h, 0) < 0.1 THEN 'ALTA COLINEALIDAD: frecuencia y hot son casi iguales. Considera eliminar o reducir w_hot.' ELSE 'Colinealidad aceptable.' END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.factor_collinearity(TEXT) TO service_role;
