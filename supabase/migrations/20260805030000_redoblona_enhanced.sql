-- ============================================================
-- MIGRATION: Redoblona Enhanced — 6-Factor Co-occurrence Engine
-- Date: 2026-08-05
-- Description: Replaces basic co-occurrence frequency analysis
--   for redoblona with full 6-factor ensemble applied to
--   head-companion pairs. Factors: Freq (25%), Recency (20%),
--   Markov (15%), Bayesian (15%), Survival (15%), Cyclic (10%)
-- ============================================================

-- ── FUNCTION: calcular_redoblona_enhanced ────────────────────
-- Given a cabeza number and turno, scores each伴奏 using 6 factors
DROP FUNCTION IF EXISTS calcular_redoblona_enhanced(int, text);
CREATE OR REPLACE FUNCTION calcular_redoblona_enhanced(
  numero_cabeza INT,
  turno_objetivo TEXT
)
RETURNS TABLE (
  numero_acompanante INT,
  frecuencia_coocurrencia INT,
  probabilidad_porcentaje NUMERIC,
  puntaje_total NUMERIC,
  f_frecuencia NUMERIC,
  f_recencia NUMERIC,
  f_markov NUMERIC,
  f_bayesiano NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws_with_cabeza INT;
  w_freq NUMERIC := 25;
  w_rec NUMERIC := 20;
  w_mark NUMERIC := 15;
  w_bay NUMERIC := 15;
  w_surv NUMERIC := 15;
  w_cyc NUMERIC := 10;
BEGIN
  -- Count total draws where this cabeza appeared
  SELECT COUNT(*) INTO total_draws_with_cabeza
  FROM draws
  WHERE turno = turno_objetivo
    AND MOD(numbers[1], 100) = numero_cabeza;

  RETURN QUERY
  WITH sorteos_cabeza AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws
    WHERE turno = turno_objetivo
      AND MOD(numbers[1], 100) = numero_cabeza
  ),
  -- Extract伴奏 with draw position for recency
  acompanantes_raw AS (
    SELECT
      sc.rn,
      sc.date,
      MOD(unnest(sc.numbers[2:20]), 100) AS acomp
    FROM sorteos_cabeza sc
  ),
  acompanantes AS (
    SELECT rn, date, acomp AS n
    FROM acompanantes_raw
    WHERE acomp IS NOT NULL AND acomp != numero_cabeza
  ),
  -- Factor 1: Frequency (total co-occurrences)
  freq AS (
    SELECT n, COUNT(*) AS appearances
    FROM acompanantes
    GROUP BY n
  ),
  max_freq AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM freq),
  -- Factor 2: Recency (exponential decay by draw order)
  recency AS (
    SELECT n, SUM(EXP(-0.05 * rn)) AS recency_score
    FROM acompanantes
    GROUP BY n
  ),
  max_rec AS (SELECT COALESCE(MAX(recency_score), 1) AS mx FROM recency),
  -- Factor 3: Markov (transitions from last head→伴奏)
  last_head_draw AS (
    SELECT numbers, MOD(numbers[1], 100) AS head
    FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC
    LIMIT 1
  ),
  last_transitions AS (
    SELECT MOD(unnest(lhd.numbers[2:20]), 100) AS n
    FROM last_head_draw lhd
    WHERE MOD(lhd.numbers[1], 100) = numero_cabeza
  ),
  markov AS (
    SELECT n, COUNT(*) AS transitions
    FROM last_transitions
    WHERE n IS NOT NULL AND n != numero_cabeza
    GROUP BY n
  ),
  max_mark AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  -- Factor 4: Bayesian posterior (Dirichlet-Multinomial)
  bayesian AS (
    SELECT n, (COUNT(*) + 1.0) / (total_draws_with_cabeza + 100.0) AS posterior
    FROM acompanantes
    GROUP BY n
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  -- Factor 5: Survival (draws since last co-occurrence)
  last_cooccurrence AS (
    SELECT n, MIN(rn) AS last_rn
    FROM acompanantes
    GROUP BY n
  ),
  survival AS (
    SELECT n, last_rn AS survival_score
    FROM last_cooccurrence
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  -- Factor 6: Cyclic (periodicity of co-occurrence)
  cyclic AS (
    SELECT n,
      CASE WHEN COUNT(*) > 1 THEN
        (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws_with_cabeza::NUMERIC
      END AS cycle_length
    FROM acompanantes
    GROUP BY n
  ),
  max_cyc AS (SELECT COALESCE(MAX(ABS(8 - cycle_length)), 1) AS mx FROM cyclic)

  SELECT
    f.n AS numero_acompanante,
    f.appearances::INT AS frecuencia_coocurrencia,
    ROUND(
      (f.appearances::NUMERIC / NULLIF(total_draws_with_cabeza, 0)) * 100,
      2
    ) AS probabilidad_porcentaje,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((ABS(8 - c.cycle_length) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((ABS(8 - c.cycle_length) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
  FROM freq f
  LEFT JOIN recency r ON f.n = r.n
  LEFT JOIN markov mk ON f.n = mk.n
  LEFT JOIN bayesian b ON f.n = b.n
  LEFT JOIN survival s ON f.n = s.n
  LEFT JOIN cyclic c ON f.n = c.n
  CROSS JOIN max_freq mf
  CROSS JOIN max_rec mr
  CROSS JOIN max_mark mm
  CROSS JOIN max_bay mb
  CROSS JOIN max_surv ms
  CROSS JOIN max_cyc mc
  WHERE f.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 3;
END;
$$;

-- ── UPDATED: refresh_cached_predictions with enhanced redoblona ──
CREATE OR REPLACE FUNCTION refresh_cached_predictions(turno_objetivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pred_date DATE;
  top10 JSONB;
  redoblona_data JSONB;
  cabeza_num INT;
  total_draws INT;
  redoblona_res RECORD;
BEGIN
  pred_date := CURRENT_DATE;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- Calculate Top 10 (4-factor fast)
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (SELECT * FROM calcular_prediccion_maestra(turno_objetivo)) t;

  -- Calculate redoblona with enhanced 6-factor analysis
  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (SELECT * FROM calcular_redoblona_enhanced(cabeza_num, turno_objetivo)) r
      )
    ) INTO redoblona_res;

    redoblona_data := row_to_json(redoblona_res)::JSONB;
  ELSE
    redoblona_data := NULL;
  END IF;

  INSERT INTO cached_predictions (turno, prediction_date, numeros, redoblona, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(top10, '[]'::JSONB), redoblona_data, total_draws, now())
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    redoblona = EXCLUDED.redoblona,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();
END;
$$;

-- Also update the v3 version used by the engine
CREATE OR REPLACE FUNCTION refresh_cached_predictions_v3(turno_objetivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pred_date DATE;
  top10 JSONB;
  advanced_top10 JSONB;
  redoblona_data JSONB;
  cabeza_num INT;
  total_draws INT;
  redoblona_res RECORD;
  dynamic_weights JSONB;
  factor_w RECORD;
BEGIN
  pred_date := CURRENT_DATE;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- Get dynamic weights from engine_factor_weights
  SELECT jsonb_object_agg(factor_name, weight)
  INTO dynamic_weights
  FROM engine_factor_weights;

  -- Build weight array for advanced engine
  SELECT jsonb_build_array(
    weight_calor, weight_demora, weight_afinidad,
    weight_markov, weight_bayesian, weight_entropy,
    weight_supervivencia, weight_ciclico, weight_drift,
    weight_correlacion, weight_estacional, weight_montecarlo
  )
  INTO factor_w
  FROM engine_factor_weights LIMIT 1;

  -- Calculate Top 10 (4-factor fast)
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (SELECT * FROM calcular_prediccion_maestra(turno_objetivo)) t;

  -- Calculate advanced Top 10 (12-factor)
  SELECT jsonb_agg(row_to_json(t))
  INTO advanced_top10
  FROM (SELECT * FROM calcular_prediccion_avanzada(turno_objetivo, factor_w)) t;

  -- Calculate redoblona with enhanced 6-factor analysis
  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (SELECT * FROM calcular_redoblona_enhanced(cabeza_num, turno_objetivo)) r
      )
    ) INTO redoblona_res;

    redoblona_data := row_to_json(redoblona_res)::JSONB;
  ELSE
    redoblona_data := NULL;
  END IF;

  -- Store in advanced_analysis
  INSERT INTO advanced_analysis (turno, analysis_date, top_numeros, redoblona, factor_weights, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(advanced_top10, '[]'::JSONB), redoblona_data, dynamic_weights, total_draws, now())
  ON CONFLICT (turno, analysis_date)
  DO UPDATE SET
    top_numeros = EXCLUDED.top_numeros,
    redoblona = EXCLUDED.redoblona,
    factor_weights = EXCLUDED.factor_weights,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();

  -- Also update cached_predictions (dual-write for backwards compat)
  INSERT INTO cached_predictions (turno, prediction_date, numeros, redoblona, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(top10, '[]'::JSONB), redoblona_data, total_draws, now())
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    redoblona = EXCLUDED.redoblona,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();
END;
$$;
