-- ============================================================
-- MIGRATION: Phase 2 — Critical Fixes
-- Date: 2026-08-05
-- Description:
--   1. Add missing status + updated_at columns to user_predictions
--   2. Fix calcular_prediccion_enhanced (dead code: wrong column names)
--   3. Fix trigger to call refresh_cached_predictions_v3 (advanced_analysis)
--   4. Fix cross-jurisdiccion total >100 in calcular_prediccion_enhanced_v2
--   5. Fix free limit mismatch (DB 30 → app 10)
--   6. Create enqueue_verification + process_verification_queue RPCs
-- ============================================================

-- ── 1. Add missing columns to user_predictions ──────────────
DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Backfill status for any rows that are NULL
UPDATE user_predictions SET status = 'pending' WHERE status IS NULL;

-- Index for the auto-verify trigger query
CREATE INDEX IF NOT EXISTS idx_user_pred_status ON user_predictions (turno, date, status);

-- ── 2. Fix calcular_prediccion_enhanced — wrong column names ─
-- The function referenced weights.weight_calor but get_factor_weights()
-- returns w_calor. Also called get_factor_weights() without argument.
DROP FUNCTION IF EXISTS calcular_prediccion_enhanced(text);
CREATE OR REPLACE FUNCTION calcular_prediccion_enhanced(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  f_calor NUMERIC,
  f_demora NUMERIC,
  f_afinidad NUMERIC,
  f_markov NUMERIC,
  f_bayesian NUMERIC,
  f_entropy NUMERIC,
  f_survival NUMERIC,
  f_cyclic NUMERIC,
  f_drift NUMERIC,
  f_correlation NUMERIC,
  f_seasonal NUMERIC,
  f_montecarlo NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  weights RECORD;
BEGIN
  SELECT * INTO weights FROM get_factor_weights(turno_objetivo) LIMIT 1;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  RETURN QUERY
  WITH all_draws AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  all_numbers AS (
    SELECT rn, date, MOD(unnest(numbers), 100) AS num
    FROM all_draws
  ),
  calor AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers WHERE rn <= 100 GROUP BY num
  ),
  max_calor AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM calor),
  last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn FROM all_numbers GROUP BY num
  ),
  max_demora AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM last_appearances),
  afinidad AS (
    SELECT num AS n, COUNT(*) AS appearances FROM all_numbers GROUP BY num
  ),
  max_afinidad AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM afinidad),
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
  bayesian AS (
    SELECT num AS n, (COUNT(*) + 1.0) / (total_draws + 100.0) AS posterior
    FROM all_numbers GROUP BY num
  ),
  max_bayesian AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
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
  seasonal AS (
    SELECT an.num AS n,
      SUM(CASE WHEN EXTRACT(DAY FROM an.date) <= 15 THEN 1 ELSE 0 END)::NUMERIC /
      NULLIF(COUNT(*), 0) AS early_ratio
    FROM all_numbers an GROUP BY an.num
  ),
  max_seasonal AS (SELECT COALESCE(MAX(ABS(early_ratio - 0.5)), 0.001) AS mx FROM seasonal),
  montecarlo AS (
    SELECT num AS n, SUM(EXP(-0.02 * rn)) AS mc_score FROM all_numbers GROUP BY num
  ),
  max_mc AS (SELECT COALESCE(MAX(mc_score), 1) AS mx FROM montecarlo)

  SELECT
    c.n AS numero,
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
      COALESCE(mc2.mc_score / mmc.mx * weights.w_montecarlo, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((c.appearances::NUMERIC / mc1.mx) * 100, 0)::NUMERIC(5,2) AS f_calor,
    COALESCE((la.last_rn::NUMERIC / md.mx) * 100, 0)::NUMERIC(5,2) AS f_demora,
    COALESCE((a.appearances::NUMERIC / ma.mx) * 100, 0)::NUMERIC(5,2) AS f_afinidad,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesian,
    COALESCE((1 - e.entropy_val / me.mx) * 100, 0)::NUMERIC(5,2) AS f_entropy,
    COALESCE(ABS(s.zscore) / ms.mx * 100, 0)::NUMERIC(5,2) AS f_survival,
    COALESCE(cy.cyclic_score / mcy.mx * 100, 0)::NUMERIC(5,2) AS f_cyclic,
    COALESCE(d.drift_val / md2.mx * 100, 0)::NUMERIC(5,2) AS f_drift,
    COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * 100, 0)::NUMERIC(5,2) AS f_correlation,
    COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * 100, 0)::NUMERIC(5,2) AS f_seasonal,
    COALESCE(mc2.mc_score / mmc.mx * 100, 0)::NUMERIC(5,2) AS f_montecarlo
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
  WHERE c.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── 3. Fix trigger to call refresh_cached_predictions_v3 ────
-- The existing trigger only calls refresh_cached_predictions (4-factor).
-- We need it to also call v3 to populate advanced_analysis.
CREATE OR REPLACE FUNCTION trigger_refresh_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 4-factor fast cache (existing)
  PERFORM refresh_cached_predictions(NEW.turno);

  -- 13-factor advanced analysis
  BEGIN
    PERFORM refresh_cached_predictions_v3(NEW.turno);
  EXCEPTION WHEN OTHERS THEN
    -- v3 function may not exist yet; skip silently
    RAISE NOTICE 'refresh_cached_predictions_v3 failed: %', SQLERRM;
  END;

  -- 3/4 cifras cache
  BEGIN
    PERFORM refresh_cached_predictions_3_4(NEW.turno);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'refresh_cached_predictions_3_4 failed: %', SQLERRM;
  END;

  -- Also refresh the previous turno (Markov chain dependency)
  IF NEW.turno = 'Primera' THEN
    PERFORM refresh_cached_predictions('Previa');
    BEGIN PERFORM refresh_cached_predictions_v3('Previa'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Previa'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Matutina' THEN
    PERFORM refresh_cached_predictions('Primera');
    BEGIN PERFORM refresh_cached_predictions_v3('Primera'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Primera'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Vespertina' THEN
    PERFORM refresh_cached_predictions('Matutina');
    BEGIN PERFORM refresh_cached_predictions_v3('Matutina'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Matutina'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Nocturna' THEN
    PERFORM refresh_cached_predictions('Vespertina');
    BEGIN PERFORM refresh_cached_predictions_v3('Vespertina'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Vespertina'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Previa' THEN
    PERFORM refresh_cached_predictions('Nocturna');
    BEGIN PERFORM refresh_cached_predictions_v3('Nocturna'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Nocturna'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 4. Fix cross-jurisdiccion total >100 in v2 ─────────────
-- The 13th factor adds hardcoded 3% which pushes total above 100.
-- Recalculate with redistributed weights: total of first 12 = 97, cross = 3
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
  calor AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers WHERE rn <= 100 GROUP BY num
  ),
  max_calor AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM calor),
  last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn FROM all_numbers GROUP BY num
  ),
  max_demora AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM last_appearances),
  afinidad AS (
    SELECT num AS n, COUNT(*) AS appearances FROM all_numbers GROUP BY num
  ),
  max_afinidad AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM afinidad),
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
  bayesian AS (
    SELECT num AS n, (COUNT(*) + 1.0) / (total_draws + 100.0) AS posterior
    FROM all_numbers GROUP BY num
  ),
  max_bayesian AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
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
  seasonal AS (
    SELECT an.num AS n,
      SUM(CASE WHEN EXTRACT(DAY FROM an.date) <= 15 THEN 1 ELSE 0 END)::NUMERIC /
      NULLIF(COUNT(*), 0) AS early_ratio
    FROM all_numbers an GROUP BY an.num
  ),
  max_seasonal AS (SELECT COALESCE(MAX(ABS(early_ratio - 0.5)), 0.001) AS mx FROM seasonal),
  montecarlo AS (
    SELECT num AS n, SUM(EXP(-0.02 * rn)) AS mc_score FROM all_numbers GROUP BY num
  ),
  max_mc AS (SELECT COALESCE(MAX(mc_score), 1) AS mx FROM montecarlo),
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
      -- Scale first 12 factors by 97/100 so total = 97 + 3 (cross) = 100
      COALESCE((c.appearances::NUMERIC / mc1.mx) * weights.w_calor * 0.97, 0) +
      COALESCE((la.last_rn::NUMERIC / md.mx) * weights.w_demora * 0.97, 0) +
      COALESCE((a.appearances::NUMERIC / ma.mx) * weights.w_afinidad * 0.97, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * weights.w_markov * 0.97, 0) +
      COALESCE((b.posterior / mb.mx) * weights.w_bayesian * 0.97, 0) +
      COALESCE((1 - e.entropy_val / me.mx) * weights.w_entropy * 0.97, 0) +
      COALESCE(ABS(s.zscore) / ms.mx * weights.w_survival * 0.97, 0) +
      COALESCE(cy.cyclic_score / mcy.mx * weights.w_cyclic * 0.97, 0) +
      COALESCE(d.drift_val / md2.mx * weights.w_drift * 0.97, 0) +
      COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * weights.w_correlation * 0.97, 0) +
      COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * weights.w_seasonal * 0.97, 0) +
      COALESCE(mc2.mc_score / mmc.mx * weights.w_montecarlo * 0.97, 0) +
      -- Cross-jurisdiccion: 3% budget
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

-- ── 5. Fix free limit: DB trigger allows 30, app allows 10 ──
-- Align DB trigger to match app limit of 10 for free tier
CREATE OR REPLACE FUNCTION check_predictions_allowed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM user_profiles WHERE id = NEW.user_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_profile.role IN ('admin', 'premium') THEN RETURN NEW; END IF;
  IF v_profile.predictions_used >= 10 THEN
    RAISE EXCEPTION 'Free tier prediction limit reached (10/month)';
  END IF;
  IF (array_length(NEW.numbers_3c, 1) > 0 OR array_length(NEW.numbers_4c, 1) > 0) THEN
    IF v_profile.premium_until IS NULL OR v_profile.premium_until < NOW() THEN
      RAISE EXCEPTION '3 and 4 cifras require premium access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 6. Create verification queue RPCs ───────────────────────
-- enqueue_verification: stores job in a table for async processing
DROP FUNCTION IF EXISTS enqueue_verification(text);
DROP TABLE IF EXISTS verification_queue;
CREATE TABLE verification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
ALTER TABLE verification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_vq" ON verification_queue FOR ALL USING (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION enqueue_verification(p_payload JSONB)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO verification_queue (payload) VALUES (p_payload);
END;
$$;

-- process_verification_queue: fetches and marks jobs as processed
CREATE OR REPLACE FUNCTION process_verification_queue(p_batch_size INT DEFAULT 10)
RETURNS TABLE (processed INT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH to_process AS (
    SELECT id FROM verification_queue
    WHERE status = 'pending'
    ORDER BY created_at
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE verification_queue
  SET status = 'processed', processed_at = now()
  WHERE id IN (SELECT id FROM to_process);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$;

-- ── 7. Backfill advanced_analysis for all turnos ────────────
-- Run v3 refresh to populate advanced_analysis table
DO $$
DECLARE
  turno TEXT;
BEGIN
  FOR turno IN SELECT unnest(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna']) LOOP
    BEGIN
      PERFORM refresh_cached_predictions_v3(turno);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to refresh advanced_analysis for %: %', turno, SQLERRM;
    END;
  END LOOP;
END;
$$;
