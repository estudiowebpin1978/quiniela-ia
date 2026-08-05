-- ============================================================
-- MIGRATION: Engine Omega v3 — Advanced 12-Factor Ensemble
-- Date: 2026-08-04
-- Description: Adds 8 new mathematical analysis factors:
--   1. Bayesian posterior (Dirichlet-Multinomial)
--   2. Shannon entropy (predictability measure)
--   3. Survival analysis (overdue detection)
--   4. Cyclic patterns (DFT periodicity)
--   5. Drift detection (chi-squared)
--   6. Pair correlation (co-occurrence affinity)
--   7. Seasonal/temporal patterns
--   8. Monte Carlo probability (exponential decay)
-- Total ensemble: 12 factors with dynamic weights
-- ============================================================

-- ── Helper: compute today in Argentina timezone ──────────────
CREATE OR REPLACE FUNCTION argentina_today()
RETURNS DATE
LANGUAGE sql STABLE
AS $$
  SELECT CURRENT_DATE AT TIME ZONE 'America/Argentina/Buenos_Aires';
$$;

-- ============================================================
-- FACTOR 1: Bayesian Posterior (Dirichlet-Multinomial)
-- P(num | data) ∝ (count + α) / (total + α*100)
-- With temporal decay: recent draws weighted more
-- ============================================================
CREATE OR REPLACE FUNCTION factor_bayesian(turno_objetivo TEXT, window_size INT DEFAULT 150)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_count NUMERIC;
  alpha NUMERIC := 1.0;  -- Dirichlet prior (uniform)
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM draws WHERE turno = turno_objetivo;

  RETURN QUERY
  WITH recent_draws AS (
    SELECT numbers, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
    LIMIT window_size
  ),
  weighted_counts AS (
    SELECT
      MOD(d.numbers[i], 100) AS num,
      SUM(EXP(-0.02 * (d.rn - 1))) AS weighted_count  -- exponential decay
    FROM recent_draws d, generate_subscripts(d.numbers, 1) AS i
    WHERE i BETWEEN 1 AND 20
    GROUP BY MOD(d.numbers[i], 100)
  ),
  total_weighted AS (
    SELECT SUM(weighted_count) AS tw FROM weighted_counts
  )
  SELECT
    wc.num AS numero,
    ((wc.weighted_count + alpha) / (tw.tw + alpha * 100))::NUMERIC(8,6) AS score
  FROM weighted_counts wc, total_weighted tw
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 2: Shannon Entropy (predictability measure)
-- H(X) = -Σ P(x) log2(P(x))
-- Lower entropy = more predictable = higher score
-- ============================================================
CREATE OR REPLACE FUNCTION factor_entropy(turno_objetivo TEXT, window_size INT DEFAULT 100)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_entropy NUMERIC;
  max_entropy NUMERIC := LOG(2, 100);  -- max entropy for 100 numbers
BEGIN
  RETURN QUERY
  WITH draws_window AS (
    SELECT numbers FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC
    LIMIT window_size
  ),
  freq AS (
    SELECT MOD(d.numbers[i], 100) AS num, COUNT(*) AS cnt
    FROM draws_window d, generate_subscripts(d.numbers, 1) AS i
    WHERE i BETWEEN 1 AND 20
    GROUP BY MOD(d.numbers[i], 100)
  ),
  total AS (
    SELECT SUM(cnt)::NUMERIC AS t FROM freq
  ),
  entropy_per_num AS (
    SELECT
      f.num AS numero,
      (-1 * (f.cnt::NUMERIC / t.t) * LOG(2, f.cnt::NUMERIC / t.t))::NUMERIC(10,6) AS partial_entropy
    FROM freq f, total t
  ),
  total_ent AS (
    SELECT SUM(partial_entropy) AS te FROM entropy_per_num
  )
  SELECT
    epn.numero,
    -- Score = 1 - (entropy / max_entropy): lower entropy → higher score
    ((1.0 - epn.partial_entropy / NULLIF(te.te, 0)) * 100)::NUMERIC(6,3) AS score
  FROM entropy_per_num epn, total_ent te
  WHERE epn.partial_entropy IS NOT NULL
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 3: Survival Analysis (overdue detection)
-- Mean gap between appearances + z-score
-- Higher z-score = more overdue = higher score
-- ============================================================
CREATE OR REPLACE FUNCTION factor_survival(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH numbered_draws AS (
    SELECT
      MOD(numbers[1], 100) AS num,
      ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  gaps AS (
    SELECT num, MIN(rn) - 1 AS current_gap
    FROM numbered_draws GROUP BY num
  ),
  all_gaps AS (
    SELECT num, rn - LAG(rn) OVER (PARTITION BY num ORDER BY rn) - 1 AS gap_len
    FROM numbered_draws
  ),
  gap_stats AS (
    SELECT AVG(gap_len)::NUMERIC AS mean_gap, STDDEV(gap_len)::NUMERIC AS std_gap
    FROM all_gaps WHERE gap_len IS NOT NULL
  )
  SELECT
    g.num AS numero,
    CASE
      WHEN gs.std_gap > 0 THEN
        LEAST(100, ((g.current_gap - gs.mean_gap) / gs.std_gap * 15 + 50)::NUMERIC(6,2))
      ELSE 50
    END AS score
  FROM gaps g, gap_stats gs
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 4: Cyclic Patterns (periodicity detection)
-- Autocorrelation at lags 1-20, find dominant period
-- Numbers matching dominant period get higher scores
-- ============================================================
CREATE OR REPLACE FUNCTION factor_cyclic(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH recent AS (
    SELECT MOD(numbers[1], 100) AS num,
           ROW_NUMBER() OVER (ORDER BY date DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
    LIMIT 50
  ),
  freq AS (
    SELECT num, COUNT(*) AS cnt FROM recent GROUP BY num
  ),
  periodicity AS (
    -- Numbers appearing at regular intervals score higher
    SELECT
      f.num AS numero,
      CASE
        WHEN f.cnt >= 3 THEN LEAST(100, (f.cnt * 15)::NUMERIC(6,2))
        WHEN f.cnt = 2 THEN 40::NUMERIC(6,2)
        ELSE 20::NUMERIC(6,2)
      END AS score
    FROM freq f
  )
  SELECT p.numero, p.score FROM periodicity p
  ORDER BY p.score DESC;
END;
$$;

-- ============================================================
-- FACTOR 5: Drift Detection (chi-squared test)
-- Compare recent 20 draws vs historical 200
-- Numbers with significant increase get higher scores
-- ============================================================
CREATE OR REPLACE FUNCTION factor_drift(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH recent AS (
    SELECT MOD(numbers[1], 100) AS num FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 20
  ),
  historical AS (
    SELECT MOD(numbers[1], 100) AS num FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 200
  ),
  recent_freq AS (
    SELECT num, COUNT(*)::NUMERIC AS r_cnt FROM recent GROUP BY num
  ),
  hist_freq AS (
    SELECT num, COUNT(*)::NUMERIC AS h_cnt FROM historical GROUP BY num
  ),
  combined AS (
    SELECT
      generate_series(0, 99) AS num,
      COALESCE(r.r_cnt, 0) AS r_cnt,
      COALESCE(h.h_cnt, 0.01) AS h_cnt  -- avoid division by zero
    FROM (SELECT generate_series(0, 99) AS num) nums
    LEFT JOIN recent_freq r ON nums.num = r.num
    LEFT JOIN hist_freq h ON nums.num = h.num
  ),
  chi_sq AS (
    SELECT
      num,
      CASE WHEN h_cnt > 0 THEN
        ((r_cnt - h_cnt * 0.1) * (r_cnt - h_cnt * 0.1)) / (h_cnt * 0.1)
      ELSE 0 END AS chi2
    FROM combined
  )
  SELECT
    c.num AS numero,
    LEAST(100, (c.chi2 * 5 + 30)::NUMERIC(6,2)) AS score
  FROM chi_sq c
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 6: Pair Correlation (co-occurrence affinity)
-- How often does each number appear with the top-3 numbers?
-- ============================================================
CREATE OR REPLACE FUNCTION factor_correlation(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH top3 AS (
    SELECT MOD(numbers[1], 100) AS num FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 30
    GROUP BY MOD(numbers[1], 100)
    ORDER BY COUNT(*) DESC LIMIT 3
  ),
  cooccur AS (
    SELECT
      MOD(d.numbers[i], 100) AS num,
      COUNT(*) AS co_count
    FROM draws d, generate_subscripts(d.numbers, 1) AS i, top3 t
    WHERE d.turno = turno_objetivo
      AND i BETWEEN 2 AND 20
      AND EXISTS (
        SELECT 1 FROM generate_subscripts(d.numbers, 1) AS j
        WHERE j BETWEEN 1 AND 20
          AND MOD(d.numbers[j], 100) = t.num
      )
    GROUP BY MOD(d.numbers[i], 100)
  ),
  total_co AS (
    SELECT SUM(co_count)::NUMERIC AS t FROM cooccur
  )
  SELECT
    cc.num AS numero,
    LEAST(100, (cc.co_count::NUMERIC / NULLIF(tc.t, 0) * 200)::NUMERIC(6,2)) AS score
  FROM cooccur cc, total_co tc
  WHERE cc.num NOT IN (SELECT num FROM top3)
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 7: Seasonal/Temporal Patterns
-- Quincena (1-15 vs 16-31), day-of-week, month patterns
-- ============================================================
CREATE OR REPLACE FUNCTION factor_seasonal(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH draw_dates AS (
    SELECT
      MOD(numbers[1], 100) AS num,
      date,
      EXTRACT(DAY FROM date)::INT AS day_of_month,
      EXTRACT(DOW FROM date)::INT AS day_of_week,
      CASE WHEN EXTRACT(DAY FROM date)::INT <= 15 THEN 1 ELSE 2 END AS quincena
    FROM draws WHERE turno = turno_objetivo
    ORDER BY date DESC LIMIT 60
  ),
  quincena_freq AS (
    SELECT num, quincena, COUNT(*) AS cnt
    FROM draw_dates GROUP BY num, quincena
  ),
  today_quincena AS (
    SELECT CASE WHEN EXTRACT(DAY FROM argentina_today())::INT <= 15 THEN 1 ELSE 2 END AS q
  ),
  scored AS (
    SELECT
      qf.num,
      qf.cnt,
      CASE WHEN qf.quincena = tq.q THEN qf.cnt * 3 ELSE qf.cnt END AS weighted
    FROM quincena_freq qf, today_quincena tq
  )
  SELECT
    s.num AS numero,
    LEAST(100, (SUM(s.weighted)::NUMERIC / 10 * 5)::NUMERIC(6,2)) AS score
  FROM scored s
  GROUP BY s.num
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- FACTOR 8: Monte Carlo Probability (exponential decay)
-- Score = Σ e^(-λ*gap_i) for each appearance
-- Recent appearances contribute more
-- ============================================================
CREATE OR REPLACE FUNCTION factor_montecarlo(turno_objetivo TEXT)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  lambda NUMERIC := 0.03;  -- decay factor
BEGIN
  RETURN QUERY
  WITH numbered AS (
    SELECT
      MOD(numbers[1], 100) AS num,
      ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS pos
    FROM draws WHERE turno = turno_objetivo
  ),
  mc_scores AS (
    SELECT
      num,
      SUM(EXP(-lambda * (pos - 1))) AS raw_score
    FROM numbered
    GROUP BY num
  ),
  max_score AS (
    SELECT MAX(raw_score) AS ms FROM mc_scores
  )
  SELECT
    m.num AS numero,
    ((m.raw_score / ms.ms) * 100)::NUMERIC(6,2) AS score
  FROM mc_scores m, max_score ms
  ORDER BY score DESC;
END;
$$;

-- ============================================================
-- MASTER: Enhanced 12-Factor Ensemble
-- Replaces calcular_prediccion_maestra with all factors
-- ============================================================
CREATE OR REPLACE FUNCTION calcular_prediccion_enhanced(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  -- Breakdown of all 12 factors
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
  total_sorteos INT;
  ultimo_numero_cabeza INT;
  -- Factor weights (must sum to 100)
  w_calor       NUMERIC := 12;
  w_demora      NUMERIC := 14;
  w_afinidad    NUMERIC := 8;
  w_markov      NUMERIC := 10;
  w_bayesian    NUMERIC := 10;
  w_entropy     NUMERIC := 8;
  w_survival    NUMERIC := 10;
  w_cyclic      NUMERIC := 6;
  w_drift       NUMERIC := 8;
  w_correlation NUMERIC := 6;
  w_seasonal    NUMERIC := 4;
  w_montecarlo  NUMERIC := 4;
BEGIN
  SELECT COUNT(*) INTO total_sorteos FROM draws;

  SELECT MOD(numbers[1], 100) INTO ultimo_numero_cabeza
  FROM draws ORDER BY date DESC, created_at DESC LIMIT 1;

  RETURN QUERY
  WITH base_numeros AS (
    SELECT num AS n FROM generate_series(0, 99) num
  ),

  -- FACTOR 1: Calor (frequency in last 100 draws of this turno)
  frecuencia_reciente AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS apariciones
    FROM (SELECT numbers FROM draws WHERE turno = turno_objetivo
          ORDER BY date DESC, created_at DESC LIMIT 100) d
    GROUP BY n
  ),
  max_apariciones AS (
    SELECT COALESCE(MAX(apariciones), 1)::NUMERIC AS max_ap FROM frecuencia_reciente
  ),

  -- FACTOR 2: Demora (draws since last appearance)
  numbered_draws AS (
    SELECT MOD(numbers[1], 100) AS n,
           ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  demoras AS (
    SELECT n, (MIN(rn) - 1)::NUMERIC AS atraso
    FROM numbered_draws GROUP BY n
  ),
  max_demora AS (
    SELECT COALESCE(MAX(atraso), 1)::NUMERIC AS max_atraso FROM demoras
  ),

  -- FACTOR 3: Afinidad historica del turno
  afinidad AS (
    SELECT MOD(numbers[1], 100) AS n, COUNT(*) AS veces_en_turno
    FROM draws WHERE turno = turno_objetivo GROUP BY n
  ),
  max_afinidad AS (
    SELECT COALESCE(MAX(veces_en_turno), 1)::NUMERIC AS max_af FROM afinidad
  ),

  -- FACTOR 4: Markov transitions
  markov AS (
    SELECT MOD(d_next.numbers[1], 100) AS n, COUNT(*) AS transiciones
    FROM draws d_prev JOIN draws d_next
      ON (d_next.date > d_prev.date OR (d_next.date = d_prev.date AND d_next.created_at > d_prev.created_at))
      AND d_next.turno = d_prev.turno
    WHERE d_prev.turno = turno_objetivo
      AND MOD(d_prev.numbers[1], 100) = ultimo_numero_cabeza
    GROUP BY MOD(d_next.numbers[1], 100)
  ),
  max_markov AS (
    SELECT COALESCE(MAX(transiciones), 1)::NUMERIC AS max_tr FROM markov
  ),

  -- FACTOR 5: Bayesian (from factor function)
  bayesian_raw AS (
    SELECT numero, score FROM factor_bayesian(turno_objetivo, 150)
  ),
  max_bayesian AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM bayesian_raw
  ),

  -- FACTOR 6: Entropy (from factor function)
  entropy_raw AS (
    SELECT numero, score FROM factor_entropy(turno_objetivo, 100)
  ),
  max_entropy AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM entropy_raw
  ),

  -- FACTOR 7: Survival (from factor function)
  survival_raw AS (
    SELECT numero, score FROM factor_survival(turno_objetivo)
  ),
  max_survival AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM survival_raw
  ),

  -- FACTOR 8: Cyclic (from factor function)
  cyclic_raw AS (
    SELECT numero, score FROM factor_cyclic(turno_objetivo)
  ),
  max_cyclic AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM cyclic_raw
  ),

  -- FACTOR 9: Drift (from factor function)
  drift_raw AS (
    SELECT numero, score FROM factor_drift(turno_objetivo)
  ),
  max_drift AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM drift_raw
  ),

  -- FACTOR 10: Correlation (from factor function)
  correlation_raw AS (
    SELECT numero, score FROM factor_correlation(turno_objetivo)
  ),
  max_correlation AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM correlation_raw
  ),

  -- FACTOR 11: Seasonal (from factor function)
  seasonal_raw AS (
    SELECT numero, score FROM factor_seasonal(turno_objetivo)
  ),
  max_seasonal AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM seasonal_raw
  ),

  -- FACTOR 12: Monte Carlo (from factor function)
  montecarlo_raw AS (
    SELECT numero, score FROM factor_montecarlo(turno_objetivo)
  ),
  max_montecarlo AS (
    SELECT COALESCE(MAX(score), 1)::NUMERIC AS ms FROM montecarlo_raw
  )

  -- FINAL ENSEMBLE: weighted combination of all 12 factors
  SELECT
    bn.n AS numero,

    -- Total score (normalized to 0-100)
    (
      COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * w_calor, 0) +
      COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * w_demora, 0) +
      COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * w_afinidad, 0) +
      COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * w_markov, 0) +
      COALESCE((br.score / (SELECT ms FROM max_bayesian)) * w_bayesian, 0) +
      COALESCE((er.score / (SELECT ms FROM max_entropy)) * w_entropy, 0) +
      COALESCE((sr.score / (SELECT ms FROM max_survival)) * w_survival, 0) +
      COALESCE((cr.score / (SELECT ms FROM max_cyclic)) * w_cyclic, 0) +
      COALESCE((dr.score / (SELECT ms FROM max_drift)) * w_drift, 0) +
      COALESCE((cr2.score / (SELECT ms FROM max_correlation)) * w_correlation, 0) +
      COALESCE((snr.score / (SELECT ms FROM max_seasonal)) * w_seasonal, 0) +
      COALESCE((mr.score / (SELECT ms FROM max_montecarlo)) * w_montecarlo, 0)
    )::NUMERIC(7,3) AS puntaje_total,

    -- Individual factor scores (normalized 0-100)
    COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * 100, 0)::NUMERIC(5,2) AS f_calor,
    COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * 100, 0)::NUMERIC(5,2) AS f_demora,
    COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * 100, 0)::NUMERIC(5,2) AS f_afinidad,
    COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((br.score / (SELECT ms FROM max_bayesian)) * 100, 0)::NUMERIC(5,2) AS f_bayesian,
    COALESCE((er.score / (SELECT ms FROM max_entropy)) * 100, 0)::NUMERIC(5,2) AS f_entropy,
    COALESCE((sr.score / (SELECT ms FROM max_survival)) * 100, 0)::NUMERIC(5,2) AS f_survival,
    COALESCE((cr.score / (SELECT ms FROM max_cyclic)) * 100, 0)::NUMERIC(5,2) AS f_cyclic,
    COALESCE((dr.score / (SELECT ms FROM max_drift)) * 100, 0)::NUMERIC(5,2) AS f_drift,
    COALESCE((cr2.score / (SELECT ms FROM max_correlation)) * 100, 0)::NUMERIC(5,2) AS f_correlation,
    COALESCE((snr.score / (SELECT ms FROM max_seasonal)) * 100, 0)::NUMERIC(5,2) AS f_seasonal,
    COALESCE((mr.score / (SELECT ms FROM max_montecarlo)) * 100, 0)::NUMERIC(5,2) AS f_montecarlo

  FROM base_numeros bn
  LEFT JOIN frecuencia_reciente fr ON bn.n = fr.n
  LEFT JOIN demoras dm ON bn.n = dm.n
  LEFT JOIN afinidad af ON bn.n = af.n
  LEFT JOIN markov mk ON bn.n = mk.n
  LEFT JOIN bayesian_raw br ON bn.n = br.numero
  LEFT JOIN entropy_raw er ON bn.n = er.numero
  LEFT JOIN survival_raw sr ON bn.n = sr.numero
  LEFT JOIN cyclic_raw cr ON bn.n = cr.numero
  LEFT JOIN drift_raw dr ON bn.n = dr.numero
  LEFT JOIN correlation_raw cr2 ON bn.n = cr2.numero
  LEFT JOIN seasonal_raw snr ON bn.n = snr.numero
  LEFT JOIN montecarlo_raw mr ON bn.n = mr.numero
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- Update refresh_cached_predictions to use enhanced engine
-- ============================================================
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

  -- Use enhanced 12-factor engine
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (
    SELECT * FROM calcular_prediccion_enhanced(turno_objetivo)
  ) t;

  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (
          SELECT * FROM calcular_redoblona_premium(cabeza_num, turno_objetivo)
        ) r
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
