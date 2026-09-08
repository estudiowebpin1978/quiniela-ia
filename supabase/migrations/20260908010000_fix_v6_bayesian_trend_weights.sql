-- =============================================================================
-- FIX: V6 — Habilitar bayesian + trend, corregir suma de pesos a 1.0
-- Problemas corregidos:
--   1. Bayesian se computaba pero nunca se usaba en scored CTE
--   2. Trend tenia weight en config pero no existia CTE
--   3. Pesos sumaban 0.95 en vez de 1.0
-- =============================================================================

-- 1. Agregar w_bayesian a engine_config
ALTER TABLE engine_config ADD COLUMN IF NOT EXISTS w_bayesian NUMERIC DEFAULT 0.03;

-- 2. Actualizar defaults: suma = 1.0
UPDATE engine_config SET
  w_frequency    = 0.18,
  w_markov       = 0.15,
  w_hot          = 0.18,
  w_cold         = 0.12,
  w_gap          = 0.10,
  w_cooccurrence = 0.10,
  w_positional   = 0.07,
  w_pattern      = 0.05,
  w_trend        = 0.02,
  w_bayesian     = 0.03,
  updated_at     = NOW()
WHERE engine_version = 'omega_v6';

-- 3. Reemplazar la función calculate_omega_v6 con la versión corregida
CREATE OR REPLACE FUNCTION calculate_omega_v6(
  p_turno TEXT,
  p_tier TEXT DEFAULT 'free',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  prediccion_2cifras TEXT,
  prediccion_3cifras JSONB,
  prediccion_4cifras JSONB,
  redoblona JSONB,
  factor_attribution JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  cfg RECORD;
  v_decay NUMERIC;
  v_markov_window INT;
  v_prior NUMERIC;
  v_total_draws INT;
BEGIN
  SELECT * INTO cfg
  FROM engine_config
  WHERE engine_version = 'omega_v6' AND turno = p_turno
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO cfg
    FROM engine_config
    WHERE engine_version = 'omega_v6' AND turno = 'ALL'
    LIMIT 1;
  END IF;

  v_decay := COALESCE(cfg.decay_lambda, 0.02);
  v_markov_window := COALESCE(cfg.markov_window_days, 90);
  v_prior := COALESCE(cfg.bayesian_prior, 100);

  SELECT COUNT(*) INTO v_total_draws
  FROM draws d WHERE d.turno = p_turno AND d.date < p_date;

  RETURN QUERY
  WITH params AS (
    SELECT p_turno AS target_turno, p_date AS prediction_date, v_total_draws AS total_draws
  ),

  -- All historical 2-digit numbers with position info
  all_nums AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
      d.date AS draw_date,
      (d.date - p_date) AS days_ago,
      MOD(unnest(d.numbers), 100) AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 1: FREQUENCY (multi-window weighted)
  -- ═══════════════════════════════════════════════════════════════
  freq_raw AS (
    SELECT
      an.val AS n,
      SUM(CASE WHEN an.days_ago >= -7  THEN 1 ELSE 0 END) AS cnt_7d,
      SUM(CASE WHEN an.days_ago >= -15 THEN 1 ELSE 0 END) AS cnt_15d,
      SUM(CASE WHEN an.days_ago >= -30 THEN 1 ELSE 0 END) AS cnt_30d,
      SUM(CASE WHEN an.days_ago >= -60 THEN 1 ELSE 0 END) AS cnt_60d,
      SUM(CASE WHEN an.days_ago >= -90 THEN 1 ELSE 0 END) AS cnt_90d,
      SUM(CASE WHEN an.days_ago >= -180 THEN 1 ELSE 0 END) AS cnt_180d,
      SUM(CASE WHEN an.days_ago >= -365 THEN 1 ELSE 0 END) AS cnt_365d,
      COUNT(*) AS cnt_full
    FROM all_nums an
    GROUP BY an.val
  ),
  freq_score AS (
    SELECT
      fr.n,
      (fr.cnt_7d  * cfg.w_window_7d  +
       fr.cnt_15d * cfg.w_window_15d +
       fr.cnt_30d * cfg.w_window_30d +
       fr.cnt_60d * cfg.w_window_60d +
       fr.cnt_90d * cfg.w_window_90d +
       fr.cnt_180d * cfg.w_window_180d +
       fr.cnt_365d * cfg.w_window_365d +
       fr.cnt_full * cfg.w_window_full
      ) AS score
    FROM freq_raw fr
  ),
  mx_freq AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM freq_score),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 2: BAYESIAN POSTERIOR
  -- ═══════════════════════════════════════════════════════════════
  bay AS (
    SELECT val AS n, (COUNT(*) + 1.0) / (v_total_draws + v_prior) AS posterior
    FROM all_nums GROUP BY val
  ),
  mx_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bay),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 3: MARKOV FIRST-ORDER
  -- ═══════════════════════════════════════════════════════════════
  last_head AS (
    SELECT MOD(d.numbers[1], 100) AS head
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    ORDER BY d.date DESC, d.created_at DESC LIMIT 1
  ),
  mk_trans AS (
    SELECT MOD(unnest(d.numbers[1:20]), 100) AS n
    FROM draws d, params p, last_head lh
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
      AND d.date >= p.prediction_date - (v_markov_window || ' days')::INTERVAL
      AND MOD(d.numbers[1], 100) = lh.head
  ),
  mk AS (SELECT n, COUNT(*) AS cnt FROM mk_trans WHERE n IS NOT NULL GROUP BY n),
  mx_mk AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM mk),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 4: HOT SCORE (recent exponential)
  -- ═══════════════════════════════════════════════════════════════
  hot AS (
    SELECT val AS n, SUM(EXP(-v_decay * rn)) AS score
    FROM all_nums
    WHERE draw_date >= (SELECT prediction_date - INTERVAL '90 days' FROM params)
    GROUP BY val
  ),
  mx_hot AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM hot),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 5: COLD SCORE (inverse recency)
  -- ═══════════════════════════════════════════════════════════════
  ls AS (SELECT val AS n, MIN(rn) AS lr FROM all_nums GROUP BY val),
  cold AS (
    SELECT n, CASE WHEN lr > 0 THEN 1.0 / (1.0 + lr) ELSE 0 END AS score FROM ls
  ),
  mx_cold AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM cold),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 6: GAP / OVERDUE
  -- ═══════════════════════════════════════════════════════════════
  gs AS (
    SELECT sub2.n, AVG(sub2.gap) AS mg FROM (
      SELECT val AS n, rn - LAG(rn) OVER (PARTITION BY val ORDER BY rn) AS gap
      FROM all_nums
    ) sub2 WHERE sub2.gap IS NOT NULL GROUP BY sub2.n
  ),
  ga AS (
    SELECT ls2.n,
      CASE WHEN gs2.mg > 0 THEN ls2.lr / gs2.mg ELSE 0 END AS overdue_score
    FROM ls ls2 LEFT JOIN gs gs2 ON ls2.n = gs2.n
  ),
  mx_ga AS (SELECT COALESCE(MAX(overdue_score), 0.001) AS mx FROM ga),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 7: CO-OCCURRENCE (with top-3 frequency)
  -- ═══════════════════════════════════════════════════════════════
  t3 AS (SELECT val AS n FROM all_nums GROUP BY val ORDER BY COUNT(*) DESC LIMIT 3),
  co AS (
    SELECT a.val AS n, COUNT(*) AS cnt
    FROM all_nums a
    JOIN all_nums b ON a.rn = b.rn AND b.val IN (SELECT n FROM t3) AND a.val != b.val
    GROUP BY a.val
  ),
  mx_co AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM co),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 8: POSITIONAL
  -- ═══════════════════════════════════════════════════════════════
  ps AS (
    SELECT MOD(d.numbers[1], 100) AS n, 3 AS w FROM draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[2], 100) AS n, 2 FROM draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[3], 100) AS n, 1 FROM draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  ps2 AS (SELECT n, SUM(w)::NUMERIC AS score FROM ps GROUP BY n),
  mx_ps AS (SELECT COALESCE(MAX(score), 1) AS mx FROM ps2),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 9: PATTERN PENALTY
  -- ═══════════════════════════════════════════════════════════════
  pattern AS (
    SELECT g.num AS n,
      CASE
        WHEN g.num % 11 = 0 THEN 0.3
        WHEN g.num BETWEEN 1 AND 9 THEN 0.7
        ELSE 1.0
      END AS penalty
    FROM generate_series(0, 99) g(num)
  ),

  -- ═══════════════════════════════════════════════════════════════
  -- FACTOR 10: TREND (short-term vs long-term frequency ratio)
  -- Compara frecuencia reciente (30d) con frecuencia historica.
  -- Si reciente > historico → score alto (en tendencia ascendente).
  -- ═══════════════════════════════════════════════════════════════
  trend AS (
    SELECT
      fr.n,
      CASE
        WHEN fr.cnt_full > 0 THEN
          LEAST(1.0, (fr.cnt_30d::NUMERIC / GREATEST(fr.cnt_full, 1)) * 3.0)
        ELSE 0
      END AS score
    FROM freq_raw fr
  ),
  mx_trend AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM trend),

  -- ═══════════════════════════════════════════════════════════════
  -- FINAL SCORE (10 factores, suma = 1.0)
  -- ═══════════════════════════════════════════════════════════════
  all_sc AS (
    SELECT
      g.num AS num_val,
      COALESCE(fs.score / mx_freq.mx, 0) AS s_freq,
      COALESCE(bay.posterior / mx_bay.mx, 0) AS s_bay,
      COALESCE(mk.cnt::NUMERIC / mx_mk.mx, 0) AS s_markov,
      COALESCE(hot.score / mx_hot.mx, 0) AS s_hot,
      COALESCE(cold.score / mx_cold.mx, 0) AS s_cold,
      COALESCE(ga2.overdue_score / mx_ga.mx, 0) AS s_gap,
      COALESCE(COALESCE(co2.cnt, 0)::NUMERIC / mx_co.mx, 0) AS s_coor,
      COALESCE(ps2.score / mx_ps.mx, 0) AS s_pos,
      COALESCE(pat.penalty, 1.0) AS s_pattern,
      COALESCE(tr.score / mx_trend.mx, 0) AS s_trend
    FROM generate_series(0, 99) g(num)
    LEFT JOIN freq_score fs ON g.num = fs.n
    LEFT JOIN bay ON g.num = bay.n
    LEFT JOIN mk ON g.num = mk.n
    LEFT JOIN hot ON g.num = hot.n
    LEFT JOIN cold ON g.num = cold.n
    LEFT JOIN ga ga2 ON g.num = ga2.n
    LEFT JOIN co co2 ON g.num = co2.n
    LEFT JOIN ps2 ON g.num = ps2.n
    LEFT JOIN pattern pat ON g.num = pat.n
    LEFT JOIN trend tr ON g.num = tr.n
    CROSS JOIN mx_freq CROSS JOIN mx_bay CROSS JOIN mx_mk
    CROSS JOIN mx_hot CROSS JOIN mx_cold CROSS JOIN mx_ga
    CROSS JOIN mx_co CROSS JOIN mx_ps CROSS JOIN mx_trend
  ),
  scored AS (
    SELECT
      num_val,
      (COALESCE(cfg.w_frequency, 0.18) * s_freq +
       COALESCE(cfg.w_markov, 0.15) * s_markov +
       COALESCE(cfg.w_hot, 0.18) * s_hot +
       COALESCE(cfg.w_cold, 0.12) * s_cold +
       COALESCE(cfg.w_gap, 0.10) * s_gap +
       COALESCE(cfg.w_cooccurrence, 0.10) * s_coor +
       COALESCE(cfg.w_positional, 0.07) * s_pos +
       COALESCE(cfg.w_pattern, 0.05) * (1.0 - s_pattern) +
       COALESCE(cfg.w_bayesian, 0.03) * s_bay +
       COALESCE(cfg.w_trend, 0.02) * s_trend
      )::NUMERIC(7,5) AS score_val,
      jsonb_build_object(
        'frequency', round(s_freq, 4),
        'markov', round(s_markov, 4),
        'hot', round(s_hot, 4),
        'cold', round(s_cold, 4),
        'gap', round(s_gap, 4),
        'cooccurrence', round(s_coor, 4),
        'positional', round(s_pos, 4),
        'pattern', round(s_pattern, 4),
        'bayesian', round(s_bay, 4),
        'trend', round(s_trend, 4)
      ) AS factor_attr
    FROM all_sc
  ),
  top_2c AS (
    SELECT s.num_val, s.score_val, s.factor_attr
    FROM scored s
    WHERE s.score_val > 0
    ORDER BY s.score_val DESC
    LIMIT 10
  ),

  -- 3 CIFRAS
  all_nums_3 AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC) AS rn,
           LPAD(MOD(unnest(d.numbers), 1000)::TEXT, 3, '0') AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_3 AS (
    SELECT val AS n, COUNT(*) AS cnt, SUM(EXP(-0.03 * rn)) AS score
    FROM all_nums_3 GROUP BY val
  ),
  top_3c AS (
    SELECT n AS num_val FROM freq_3 WHERE cnt >= 2 ORDER BY score DESC LIMIT 10
  ),

  -- 4 CIFRAS
  all_nums_4 AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC) AS rn,
           LPAD(unnest(d.numbers)::TEXT, 4, '0') AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_4 AS (
    SELECT val AS n, COUNT(*) AS cnt, SUM(EXP(-0.04 * rn)) AS score
    FROM all_nums_4 GROUP BY val
  ),
  top_4c AS (
    SELECT n AS num_val FROM freq_4 WHERE cnt >= 2 ORDER BY score DESC LIMIT 10
  ),

  -- REDOBLONA
  pair_data AS (
    SELECT DISTINCT d.date, LPAD(MOD(v, 100)::TEXT, 2, '0') AS ambo
    FROM draws d, unnest(d.numbers) v, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  top_2c_arr AS (
    SELECT array_agg(LPAD(num_val::TEXT, 2, '0') ORDER BY num_val) AS arr FROM top_2c
  ),
  pair_freq AS (
    SELECT a.ambo AS cabeza, b.ambo AS acompanante, COUNT(*) AS cnt
    FROM pair_data a
    JOIN pair_data b ON a.date = b.date AND a.ambo < b.ambo
    WHERE a.ambo IN (SELECT unnest(arr) FROM top_2c_arr)
      AND b.ambo IN (SELECT unnest(arr) FROM top_2c_arr)
    GROUP BY a.ambo, b.ambo
  ),
  best_pair AS (
    SELECT cabeza, acompanante FROM pair_freq ORDER BY cnt DESC LIMIT 1
  ),

  -- OUTPUT
  t2_arr AS (SELECT array_agg(num_val ORDER BY score_val DESC) AS arr FROM top_2c),
  t3_arr AS (SELECT array_agg(num_val ORDER BY num_val) AS arr FROM top_3c),
  t4_arr AS (SELECT array_agg(num_val ORDER BY num_val) AS arr FROM top_4c),
  first_row AS (
    SELECT
      (SELECT arr[1] FROM t2_arr) AS numero,
      (SELECT score_val FROM top_2c ORDER BY score_val DESC LIMIT 1) AS puntaje_total,
      (SELECT string_agg(LPAD(n::TEXT, 2, '0'), ',' ORDER BY n) FROM unnest((SELECT arr FROM t2_arr)) n) AS prediccion_2cifras,
      CASE WHEN p_tier = 'premium' THEN to_jsonb((SELECT arr FROM t3_arr)) ELSE NULL::JSONB END AS prediccion_3cifras,
      CASE WHEN p_tier = 'premium' THEN to_jsonb((SELECT arr FROM t4_arr)) ELSE NULL::JSONB END AS prediccion_4cifras,
      CASE WHEN p_tier = 'premium' THEN jsonb_build_object('cabeza', (SELECT cabeza FROM best_pair), 'acompanante', (SELECT acompanante FROM best_pair)) ELSE NULL::JSONB END AS redoblona,
      (SELECT factor_attr FROM top_2c ORDER BY score_val DESC LIMIT 1) AS factor_attribution
  ),
  remaining_rows AS (
    SELECT
      t2c.num_val AS numero,
      0::NUMERIC AS puntaje_total,
      LPAD(t2c.num_val::TEXT, 2, '0') AS prediccion_2cifras,
      NULL::JSONB AS prediccion_3cifras,
      NULL::JSONB AS prediccion_4cifras,
      NULL::JSONB AS redoblona,
      t2c.factor_attr AS factor_attribution
    FROM top_2c t2c
    ORDER BY t2c.score_val DESC
    OFFSET 1
  )
  SELECT * FROM first_row WHERE first_row.numero IS NOT NULL
  UNION ALL
  SELECT * FROM remaining_rows;

END;
$$;
