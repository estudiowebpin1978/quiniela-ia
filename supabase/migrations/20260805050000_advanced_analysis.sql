-- ============================================================
-- MIGRATION: Advanced Analysis Table + V3 Refresh + Cross-Jurisdiccion
-- Date: 2026-08-05
-- ============================================================

-- ── 1. Create advanced_analysis table ───────────────────────
CREATE TABLE IF NOT EXISTS advanced_analysis (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  analysis_date DATE NOT NULL,
  top_numeros JSONB NOT NULL,
  factor_weights JSONB,
  total_sorteos_analizados INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno, analysis_date)
);
CREATE INDEX IF NOT EXISTS idx_advanced_turno_date ON advanced_analysis (turno, analysis_date DESC);

ALTER TABLE advanced_analysis ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_all_advanced" ON advanced_analysis;
  DROP POLICY IF EXISTS "public_read_advanced" ON advanced_analysis;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "service_role_all_advanced" ON advanced_analysis FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_advanced" ON advanced_analysis FOR SELECT USING (true);

-- ── 2. Create calcular_prediccion_enhanced_v2 (13 factors) ──
-- Adds cross-jurisdiccion as 13th factor (3% weight)
-- Redistribution: Calor 11, Demora 13, Afinidad 7, Markov 9,
-- Bayesian 9, Entropy 7, Survival 9, Cyclic 5, Drift 7,
-- Correlation 5, Seasonal 4, MonteCarlo 4, CrossJurisd 3 = 93+7=100

DROP FUNCTION IF EXISTS calcular_prediccion_enhanced_v2(text);
CREATE OR REPLACE FUNCTION calcular_prediccion_enhanced_v2(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  num_id INT,
  puntaje_total NUMERIC,
  f_calor NUMERIC,
  f_demora NUMERIC,
  f_afinidad NUMERIC,
  f_markov NUMERIC,
  f_bayesian NUMERIC,
  f_entropy NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC,
  f_drift NUMERIC,
  f_correlacion NUMERIC,
  f_estacional NUMERIC,
  f_montecarlo NUMERIC,
  f_cross_jurisdiccion NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  weights RECORD;
  juris_target TEXT;
BEGIN
  SELECT * INTO weights FROM get_factor_weights(turno_objetivo) LIMIT 1;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;
  juris_target := CASE WHEN turno_objetivo IN ('Primera', 'Nocturna') THEN 'provincia' ELSE 'nacional' END;

  RETURN QUERY
  WITH all_draws AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  all_numbers AS (
    SELECT rn, date, MOD(unnest(numbers), 100) AS num
    FROM all_draws
  ),
  -- F1: Calor
  calor AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers WHERE rn <= 100 GROUP BY num
  ),
  max_calor AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM calor),
  -- F2: Demora (FIXED: MIN = most overdue)
  last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn FROM all_numbers GROUP BY num
  ),
  max_demora AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM last_appearances),
  -- F3: Afinidad
  afinidad AS (
    SELECT num AS n, COUNT(*) AS appearances FROM all_numbers GROUP BY num
  ),
  max_afinidad AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM afinidad),
  -- F4: Markov
  last_head AS (
    SELECT MOD(numbers[1], 100) AS head
    FROM draws WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  markov_transitions AS (
    SELECT MOD(unnest(numbers[2:5]), 100) AS n
    FROM draws WHERE turno = turno_objetivo
    AND MOD(numbers[1], 100) = (SELECT head FROM last_head)
    ORDER BY date DESC LIMIT 100
  ),
  markov AS (
    SELECT n, COUNT(*) AS transitions FROM markov_transitions WHERE n IS NOT NULL GROUP BY n
  ),
  max_markov AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  -- F5: Bayesian
  bayesian AS (
    SELECT num AS n, (COUNT(*) + 1.0) / (total_draws + 100.0) AS posterior
    FROM all_numbers GROUP BY num
  ),
  max_bayesian AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  -- F6: Entropy (fixed: no nested aggregates)
  entropy_counts AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers WHERE rn <= 100 GROUP BY num
  ),
  entropy_total AS (
    SELECT SUM(appearances) AS total FROM entropy_counts
  ),
  entropy AS (
    SELECT ec.n,
      -SUM((ec.appearances::NUMERIC / et.total) * LN(ec.appearances::NUMERIC / et.total + 0.0001)) AS entropy_val
    FROM entropy_counts ec, entropy_total et
    GROUP BY ec.n
  ),
  max_entropy AS (SELECT COALESCE(MAX(entropy_val), 1) AS mx FROM entropy),
  -- F7: Survival
  gaps AS (
    SELECT num AS n, rn,
      rn - LAG(rn) OVER (PARTITION BY num ORDER BY rn) AS gap
    FROM all_numbers
  ),
  survival_stats AS (
    SELECT n, AVG(gap) AS mean_gap, STDDEV(gap) AS std_gap
    FROM gaps WHERE gap IS NOT NULL GROUP BY n
  ),
  survival AS (
    SELECT la.n,
      CASE WHEN ss.std_gap > 0 THEN (la.last_rn - ss.mean_gap) / ss.std_gap ELSE 0 END AS zscore
    FROM last_appearances la LEFT JOIN survival_stats ss ON la.n = ss.n
  ),
  max_survival AS (SELECT COALESCE(MAX(ABS(zscore)), 1) AS mx FROM survival),
  -- F8: Cyclic (FIXED: 1/(1+ABS))
  cyclic_raw AS (
    SELECT num AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM all_numbers GROUP BY num
  ),
  cyclic AS (
    SELECT n, 1.0 / (1.0 + ABS(10 - cycle_length)) AS cyclic_score FROM cyclic_raw
  ),
  max_cyclic AS (SELECT COALESCE(MAX(cyclic_score), 0.001) AS mx FROM cyclic),
  -- F9: Drift
  recent AS (
    SELECT num AS n, COUNT(*) AS cnt FROM all_numbers WHERE rn <= 20 GROUP BY num
  ),
  historical AS (
    SELECT num AS n, COUNT(*) AS cnt FROM all_numbers GROUP BY num
  ),
  drift AS (
    SELECT COALESCE(r.n, h.n) AS n,
      ABS(COALESCE(r.cnt, 0)::NUMERIC / 20 - COALESCE(h.cnt, 0)::NUMERIC / NULLIF(total_draws, 0)) AS drift_val
    FROM recent r FULL OUTER JOIN historical h ON r.n = h.n
  ),
  max_drift AS (SELECT COALESCE(MAX(drift_val), 0.001) AS mx FROM drift),
  -- F10: Correlation
  top3 AS (
    SELECT num AS n FROM all_numbers GROUP BY num ORDER BY COUNT(*) DESC LIMIT 3
  ),
  correlation AS (
    SELECT an.num AS n, COUNT(*) AS co_count
    FROM all_numbers an
    JOIN all_numbers an2 ON an.rn = an2.rn AND an2.num IN (SELECT n FROM top3) AND an.num != an2.num
    WHERE an.num IN (SELECT n FROM calor)
    GROUP BY an.num
  ),
  max_correlation AS (SELECT COALESCE(MAX(co_count), 1) AS mx FROM correlation),
  -- F11: Seasonal
  seasonal AS (
    SELECT an.num AS n,
      SUM(CASE WHEN EXTRACT(DAY FROM an.date) <= 15 THEN 1 ELSE 0 END)::NUMERIC /
      NULLIF(COUNT(*), 0) AS early_ratio
    FROM all_numbers an GROUP BY an.num
  ),
  max_seasonal AS (SELECT COALESCE(MAX(ABS(early_ratio - 0.5)), 0.001) AS mx FROM seasonal),
  -- F12: Monte Carlo
  montecarlo AS (
    SELECT num AS n, SUM(EXP(-0.02 * rn)) AS mc_score FROM all_numbers GROUP BY num
  ),
  max_mc AS (SELECT COALESCE(MAX(mc_score), 1) AS mx FROM montecarlo),
  -- F13: Cross-Jurisdiccion
  recent_cross_draws AS (
    SELECT d.date, d.numbers, d.jurisdiccion,
           ROW_NUMBER() OVER (PARTITION BY d.jurisdiccion ORDER BY d.date DESC, d.created_at DESC) AS rn
    FROM draws d
    WHERE d.date >= (argentina_today() - 7)
  ),
  cross_jurisdiction AS (
    SELECT MOD(d.numbers[i], 100) AS num, COUNT(*) AS migration_count
    FROM recent_cross_draws d, generate_subscripts(d.numbers, 1) AS i
    WHERE i BETWEEN 1 AND 20
      AND d.jurisdiccion != juris_target
      AND d.rn <= 15
    GROUP BY MOD(d.numbers[i], 100)
  ),
  max_cross AS (SELECT COALESCE(MAX(migration_count), 1) AS mx FROM cross_jurisdiction)

  SELECT
    c.n AS numero,
    c.n AS num_id,
    (
      COALESCE((c.appearances::NUMERIC / mc1.mx) * weights.w_calor, 0) +
      COALESCE((la.last_rn::NUMERIC / md.mx) * weights.w_demora, 0) +
      COALESCE((a.appearances::NUMERIC / ma.mx) * weights.w_afinidad, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * weights.w_markov, 0) +
      COALESCE((b.posterior / mb.mx) * weights.w_bayesian, 0) +
      COALESCE((1 - e.entropy_val / me.mx) * weights.w_entropy, 0) +
      COALESCE(ABS(s.zscore) / ms.mx * weights.w_survival, 0) +
      COALESCE(cy.cyclic_score / mcy.mx * weights.w_cyclic, 0) +
      COALESCE(d.drift_val / md2.mx * weights.w_drift, 0) +
      COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * weights.w_correlation, 0) +
      COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * weights.w_seasonal, 0) +
      COALESCE(mc2.mc_score / mmc.mx * weights.w_montecarlo, 0) +
      COALESCE((cj.migration_count::NUMERIC / mcx.mx * 3), 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((c.appearances::NUMERIC / mc1.mx) * 100, 0)::NUMERIC(5,2) AS f_calor,
    COALESCE((la.last_rn::NUMERIC / md.mx) * 100, 0)::NUMERIC(5,2) AS f_demora,
    COALESCE((a.appearances::NUMERIC / ma.mx) * 100, 0)::NUMERIC(5,2) AS f_afinidad,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesian,
    COALESCE((1 - e.entropy_val / me.mx) * 100, 0)::NUMERIC(5,2) AS f_entropy,
    COALESCE(ABS(s.zscore) / ms.mx * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE(cy.cyclic_score / mcy.mx * 100, 0)::NUMERIC(5,2) AS f_ciclico,
    COALESCE(d.drift_val / md2.mx * 100, 0)::NUMERIC(5,2) AS f_drift,
    COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * 100, 0)::NUMERIC(5,2) AS f_correlacion,
    COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * 100, 0)::NUMERIC(5,2) AS f_estacional,
    COALESCE(mc2.mc_score / mmc.mx * 100, 0)::NUMERIC(5,2) AS f_montecarlo,
    COALESCE((cj.migration_count::NUMERIC / mcx.mx * 100), 0)::NUMERIC(5,2) AS f_cross_jurisdiccion
  FROM calor c
  LEFT JOIN last_appearances la ON c.n = la.n
  LEFT JOIN afinidad a ON c.n = a.n
  LEFT JOIN markov mk ON c.n = mk.n
  LEFT JOIN bayesian b ON c.n = b.n
  LEFT JOIN entropy e ON c.n = e.n
  LEFT JOIN survival s ON c.n = s.n
  LEFT JOIN cyclic cy ON c.n = cy.n
  LEFT JOIN drift d ON c.n = d.n
  LEFT JOIN correlation cr ON c.n = cr.n
  LEFT JOIN seasonal se ON c.n = se.n
  LEFT JOIN montecarlo mc2 ON c.n = mc2.n
  LEFT JOIN cross_jurisdiction cj ON c.n = cj.num
  CROSS JOIN max_calor mc1
  CROSS JOIN max_demora md
  CROSS JOIN max_afinidad ma
  CROSS JOIN max_markov mm
  CROSS JOIN max_bayesian mb
  CROSS JOIN max_entropy me
  CROSS JOIN max_survival ms
  CROSS JOIN max_cyclic mcy
  CROSS JOIN max_drift md2
  CROSS JOIN max_correlation mcr
  CROSS JOIN max_seasonal mse
  CROSS JOIN max_mc mmc
  CROSS JOIN max_cross mcx
  WHERE c.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── 3. refresh_cached_predictions_v3 (populates advanced_analysis) ──
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
  dynamic_weights JSONB;
BEGIN
  pred_date := CURRENT_DATE;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- Get dynamic weights
  SELECT jsonb_build_object(
    'calor', w_calor, 'demora', w_demora, 'afinidad', w_afinidad,
    'markov', w_markov, 'bayesian', w_bayesian, 'entropy', w_entropy,
    'survival', w_survival, 'cyclic', w_cyclic, 'drift', w_drift,
    'correlation', w_correlation, 'seasonal', w_seasonal, 'montecarlo', w_montecarlo
  ) INTO dynamic_weights
  FROM engine_factor_weights
  WHERE turno = turno_objetivo
  LIMIT 1;

  -- Calculate Top 10 (4-factor fast for cache)
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (SELECT * FROM calcular_prediccion_maestra(turno_objetivo)) t;

  -- Calculate advanced Top 10 (13-factor with cross-jurisdiccion)
  SELECT jsonb_agg(row_to_json(t))
  INTO advanced_top10
  FROM (SELECT * FROM calcular_prediccion_enhanced_v2(turno_objetivo)) t;

  -- Calculate redoblona with enhanced 6-factor analysis
  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (SELECT * FROM calcular_redoblona_enhanced(cabeza_num, turno_objetivo)) r
      )
    ) INTO redoblona_data;
  ELSE
    redoblona_data := NULL;
  END IF;

  -- Store in advanced_analysis
  INSERT INTO advanced_analysis (turno, analysis_date, top_numeros, factor_weights, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(advanced_top10, '[]'::JSONB), dynamic_weights, total_draws, now())
  ON CONFLICT (turno, analysis_date)
  DO UPDATE SET
    top_numeros = EXCLUDED.top_numeros,
    factor_weights = EXCLUDED.factor_weights,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();

  -- Also update cached_predictions (dual-write)
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
