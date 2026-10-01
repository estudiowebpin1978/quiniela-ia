CREATE OR REPLACE FUNCTION public.register_omega_promotion(
  p_turno TEXT,
  p_old_version TEXT,
  p_new_version TEXT,
  p_decision TEXT,
  p_reason TEXT DEFAULT '',
  p_sample_size INTEGER DEFAULT 0,
  p_metrics_before JSONB DEFAULT '{}'::jsonb,
  p_metrics_after JSONB DEFAULT '{}'::jsonb,
  p_weights_before JSONB DEFAULT '{}'::jsonb,
  p_weights_after JSONB DEFAULT '{}'::jsonb,
  p_calibration_before JSONB DEFAULT '{}'::jsonb,
  p_calibration_after JSONB DEFAULT '{}'::jsonb,
  p_period_start DATE DEFAULT NULL,
  p_period_end DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.omega_promotion_audit (
    turno, old_engine_version, new_engine_version,
    evaluation_period_start, evaluation_period_end, sample_size,
    metrics_before, metrics_after, weights_before, weights_after,
    calibration_before, calibration_after,
    promotion_decision, reason, promoted_at
  ) VALUES (
    p_turno, p_old_version, p_new_version,
    p_period_start, p_period_end, p_sample_size,
    p_metrics_before, p_metrics_after, p_weights_before, p_weights_after,
    p_calibration_before, p_calibration_after,
    p_decision, p_reason, NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_omega_promotion(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, DATE, DATE) TO service_role;
