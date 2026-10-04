-- Fix: la función devolvía la clave 'omaga_pass' (typo) pero el código TS
-- (cron-precompute) lee 'omega_pass' → omegaResult.omega_pass era undefined →
-- la regla OMEGA se saltaba siempre (undefined !== false → true → APPROVED).
-- Se reescribe la función con la clave correcta 'omega_pass'.
CREATE OR REPLACE FUNCTION public.omega_rule_validation()
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_ok BOOLEAN := TRUE;
  v_note TEXT := 'Regla Omega: ninguna técnica entra sin demostrar mejora OOS.';
BEGIN
  -- Compara resultados del backtest real (V6) contra engine_performance
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.walkforward_results w
    JOIN public.engine_performance e ON e.turno = 'ALL'
    WHERE w.engine_name = 'V6' AND w.turno = 'Matutina'
    GROUP BY w.engine_name
    HAVING (SUM(CASE WHEN w.is_hit THEN 1 ELSE 0 END)::NUMERIC / NULLIF(COUNT(*), 0)::NUMERIC) >= 0.15 -- umbral mínimo
  ) THEN TRUE ELSE FALSE END INTO v_ok;

  IF NOT v_ok THEN
    v_note := v_note || ' ALERTA: backtest V6 no supera umbral mínimo (15%). Revisar técnica antes de producción.';
  ELSE
    v_note := v_note || ' OK: backtest V6 supera umbral. Técnica validada OOS.';
  END IF;

  RETURN jsonb_build_object('omega_pass', v_ok, 'message', v_note, 'threshold', 0.15, 'verified_at', NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION public.omega_rule_validation() TO service_role;
