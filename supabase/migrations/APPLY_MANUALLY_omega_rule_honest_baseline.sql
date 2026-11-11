-- Fix: omega_rule_validation - comparar contra el baseline aleatorio real
-- =============================================================
-- Problema anterior:
--   * Comparaba V6 Matutina is_hit contra un umbral 0.15 (15%).
--   * El JOIN con engine_performance era no-op (no aportaba criterio).
--   * Umbral arbitrario: el baseline aleatorio para is_hit=true es ~90.49%.
--
-- Nuevo criterio (sin modificar el motor):
--   * Baseline computado matemáticamente: 1 - C(80,10)/C(100,10) ≈ 90.49%
--   * V6 debe superar al menos 1 p.p. al baseline aleatorio (>= 90.50%)
--     en Matutina para que la técnica se considere mejor que azar.
--   * Esto NO demuestra ventaja demostrable: sólo dice "no peor que azar";
--     ventaja demostrada requiere replay OOS con gap estadístico.
--   * Mensaje rompe explícitamente el mito: la lotería es justa y el modelo
--     en azar se mantiene en ~90.5% is_hit; cualquier superioridad menor a
--     margen de error estadístico NO es señal.
--
-- IDEMPOTENTE: CREATE OR REPLACE FUNCTION.
-- =============================================================

CREATE OR REPLACE FUNCTION public.omega_rule_validation()
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_ok BOOLEAN := FALSE;
  v_rate NUMERIC;
  v_baseline NUMERIC := 0.9049; -- 1 - C(80,10)/C(100,10)
  v_minimum NUMERIC := 0.92;    -- ~ baseline + 1.5 p.p. margen de seguridad
  v_note TEXT := '';
BEGIN
  -- V6 Matutina walkforward hit-rate
  SELECT COUNT(CASE WHEN is_hit THEN 1 END)::NUMERIC / NULLIF(COUNT(*), 0)
  INTO v_rate
  FROM public.walkforward_results
  WHERE engine_name = 'V6' AND turno = 'Matutina';

  IF v_rate IS NULL THEN
    v_note := 'Sin datos de walkforward para Matutina V6 — no se puede validar regla Omega (no se bloquea, se reporta).';
    RETURN jsonb_build_object(
      'omega_pass', TRUE,
      'message', v_note,
      'reason', 'no_data',
      'threshold', v_minimum,
      'baseline', v_baseline,
      'observed_rate', NULL,
      'verified_at', NOW()
    );
  END IF;

  IF v_rate >= v_minimum THEN
    v_note := format(
      'Regla Omega: V6 Matutina = %s%% (> baseline aleatorio %s%%). No bloquea — sólo confirma que la técnica no es peor que azar.',
      round(v_rate * 100, 2), round(v_baseline * 100, 2)
    );
    v_ok := TRUE;
  ELSE
    v_note := format(
      'Regla Omega: V6 Matutina = %s%% — bajo el umbral %s%% (baseline aleatorio ~90.49%%). Se reporta sin bloquear por regla Omega: ninguna técnica entra sin demostrar mejora OOS.',
      round(v_rate * 100, 2), round(v_minimum * 100, 2)
    );
    v_ok := FALSE;
  END IF;

  RETURN jsonb_build_object(
    'omega_pass', v_ok,
    'message', v_note,
    'threshold', v_minimum,
    'baseline', v_baseline,
    'observed_rate', round(v_rate, 4),
    'verified_at', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.omega_rule_validation() TO service_role;
