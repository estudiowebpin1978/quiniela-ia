CREATE OR REPLACE FUNCTION public.factor_collinearity_advanced(
  p_turno TEXT DEFAULT NULL,
  p_use_walkforward BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_corr_fh NUMERIC; v_corr_ft NUMERIC; v_corr_ht NUMERIC;
  v_notes TEXT[];
BEGIN
  -- Si se solicita usar datos del replay (OOS) y existen, usar esos datos
  IF p_use_walkforward THEN
    SELECT
      ROUND(CORR(freq, hot)::NUMERIC, 4),
      ROUND(CORR(freq, trend)::NUMERIC, 4),
      ROUND(CORR(hot, trend)::NUMERIC, 4)
    INTO v_corr_fh, v_corr_ft, v_corr_ht
    FROM (
      SELECT
        (fa ->> 'frequency')::NUMERIC AS freq,
        (fa ->> 'hot')::NUMERIC AS hot,
        (fa ->> 'trend')::NUMERIC AS trend
      FROM predictions_cache pc
      CROSS JOIN LATERAL jsonb_each_text(pc.factor_attribution) AS fa(key, value)
      WHERE (p_turno IS NULL OR pc.turno = p_turno)
        AND pc.factor_attribution IS NOT NULL
        AND pc.date >= CURRENT_DATE - INTERVAL '90 days'
      LIMIT 500
    ) AS sub;

    IF v_corr_fh IS NOT NULL OR v_corr_ft IS NOT NULL OR v_corr_ht IS NOT NULL THEN
      v_notes := ARRAY[
        'Colinealidad medida con datos OOS del replay (walkforward_results)',
        CASE WHEN COALESCE(v_corr_fh, 0) > 0.85 THEN 'ALTA COLINEALIDAD frecuencia-hot (r=' || COALESCE(v_corr_fh::TEXT, 'N/A') || ')' ELSE 'Colinealidad frecuencia-hot: r=' || COALESCE(v_corr_fh::TEXT, 'N/A') END,
        CASE WHEN COALESCE(v_corr_ft, 0) > 0.85 THEN 'ALTA COLINEALIDAD frecuencia-trend (r=' || COALESCE(v_corr_ft::TEXT, 'N/A') || ')' ELSE 'Colinealidad frecuencia-trend: r=' || COALESCE(v_corr_ft::TEXT, 'N/A') END,
        CASE WHEN COALESCE(v_corr_ht, 0) > 0.85 THEN 'ALTA COLINEALIDAD hot-trend (r=' || COALESCE(v_corr_ht::TEXT, 'N/A') || ')' ELSE 'Colinealidad hot-trend: r=' || COALESCE(v_corr_ht::TEXT, 'N/A') END,
        'Recomendación: si r > 0.85 entre factores, considerar reducir peso del factor redundante.'
      ];
      RETURN jsonb_build_object('source', 'walkforward_oos', 'frequency_hot', v_corr_fh, 'frequency_trend', v_corr_ft, 'hot_trend', v_corr_ht, 'notes', v_notes);
    END IF;
  END IF;

  -- Fallback: usar datos de predictions_cache (como antes)
  SELECT
    ROUND(STDDEV(COALESCE((fa ->> 'frequency')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'frequency')::NUMERIC, 0)), 0)::NUMERIC, 4) AS freq_corr,
    ROUND(STDDEV(COALESCE((fa ->> 'hot')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'hot')::NUMERIC, 0)), 0)::NUMERIC, 4) AS hot_corr,
    ROUND(STDDEV(COALESCE((fa ->> 'trend')::NUMERIC, 0))::NUMERIC / NULLIF(AVG(COALESCE((fa ->> 'trend')::NUMERIC, 0)), 0)::NUMERIC, 4) AS trend_corr
  INTO v_corr_fh, v_corr_ft, v_corr_ht
  FROM predictions_cache
  CROSS JOIN LATERAL jsonb_each_text(factor_attribution) AS fa(key, value)
  WHERE (p_turno IS NULL OR turno = p_turno)
    AND factor_attribution IS NOT NULL
    AND updated_at > NOW() - INTERVAL '30 days';

  v_notes := ARRAY[
    'Colinealidad medida con datos de predictions_cache (fallback a datos recientes)',
    'Nota: datos OOS del replay (walkforward_results) son preferidos.'
  ];

  RETURN jsonb_build_object('source', 'predictions_cache_fallback', 'notes', v_notes);
END;
$$;

GRANT EXECUTE ON FUNCTION public.factor_collinearity_advanced(TEXT, BOOLEAN) TO service_role;
