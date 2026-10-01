-- Fix score_numbers_v6 + calculate_omega_v6 for 3/4 cifras with full 10-factor analysis
-- Root cause: PostgREST search_path resolves 'engine_config' to api.engine_config view
-- which lacks w_bayesian/w_trend columns. Fixed by using explicit public. schema refs.
-- Also: api.engine_config view recreated to include all columns.

-- 1. Recreate api.engine_config view with all columns
DROP VIEW IF EXISTS api.engine_config CASCADE;
CREATE OR REPLACE VIEW api.engine_config AS
SELECT * FROM public.engine_config;

-- 2. Recreate score_numbers_v6 with explicit public. schema refs
DROP FUNCTION IF EXISTS public.score_numbers_v6(text, date, text, integer, integer, integer) CASCADE;
DROP FUNCTION IF EXISTS api.score_numbers_v6(text, date, text, integer, integer, integer) CASCADE;

CREATE OR REPLACE FUNCTION public.score_numbers_v6(
  p_turno TEXT, p_date DATE, p_digit_space TEXT,
  p_modulus INT, p_series_start INT, p_series_end INT
)
RETURNS TABLE (numero INT, score_val NUMERIC(7,5), factor_attr JSONB)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_decay NUMERIC;
  v_markov_window INT;
  v_prior NUMERIC;
  v_total_draws INT;
  v_w_frequency NUMERIC;
  v_w_markov NUMERIC;
  v_w_hot NUMERIC;
  v_w_cold NUMERIC;
  v_w_gap NUMERIC;
  v_w_cooccurrence NUMERIC;
  v_w_positional NUMERIC;
  v_w_pattern NUMERIC;
  v_w_bayesian NUMERIC;
  v_w_trend NUMERIC;
  v_w_window_7d NUMERIC;
  v_w_window_15d NUMERIC;
  v_w_window_30d NUMERIC;
  v_w_window_60d NUMERIC;
  v_w_window_90d NUMERIC;
  v_w_window_180d NUMERIC;
  v_w_window_365d NUMERIC;
  v_w_window_full NUMERIC;
  v_pattern_enabled BOOLEAN;
BEGIN
  SELECT
    decay_lambda, markov_window_days, bayesian_prior, pattern_penalty_enabled,
    w_frequency, w_markov, w_hot, w_cold, w_gap,
    w_cooccurrence, w_positional, w_pattern, w_bayesian, w_trend,
    w_window_7d, w_window_15d, w_window_30d, w_window_60d,
    w_window_90d, w_window_180d, w_window_365d, w_window_full
  INTO
    v_decay, v_markov_window, v_prior, v_pattern_enabled,
    v_w_frequency, v_w_markov, v_w_hot, v_w_cold, v_w_gap,
    v_w_cooccurrence, v_w_positional, v_w_pattern, v_w_bayesian, v_w_trend,
    v_w_window_7d, v_w_window_15d, v_w_window_30d, v_w_window_60d,
    v_w_window_90d, v_w_window_180d, v_w_window_365d, v_w_window_full
  FROM public.engine_config
  WHERE engine_version = 'omega_v6' AND turno = p_turno
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT
      decay_lambda, markov_window_days, bayesian_prior, pattern_penalty_enabled,
      w_frequency, w_markov, w_hot, w_cold, w_gap,
      w_cooccurrence, w_positional, w_pattern, w_bayesian, w_trend,
      w_window_7d, w_window_15d, w_window_30d, w_window_60d,
      w_window_90d, w_window_180d, w_window_365d, w_window_full
    INTO
      v_decay, v_markov_window, v_prior, v_pattern_enabled,
      v_w_frequency, v_w_markov, v_w_hot, v_w_cold, v_w_gap,
      v_w_cooccurrence, v_w_positional, v_w_pattern, v_w_bayesian, v_w_trend,
      v_w_window_7d, v_w_window_15d, v_w_window_30d, v_w_window_60d,
      v_w_window_90d, v_w_window_180d, v_w_window_365d, v_w_window_full
    FROM public.engine_config
    WHERE engine_version = 'omega_v6' AND turno = 'ALL'
    LIMIT 1;
  END IF;

  v_decay := COALESCE(v_decay, 0.02);
  v_markov_window := COALESCE(v_markov_window, 90);
  v_prior := COALESCE(v_prior, 100);
  v_w_frequency := COALESCE(v_w_frequency, 0.18);
  v_w_markov := COALESCE(v_w_markov, 0.15);
  v_w_hot := COALESCE(v_w_hot, 0.18);
  v_w_cold := COALESCE(v_w_cold, 0.12);
  v_w_gap := COALESCE(v_w_gap, 0.10);
  v_w_cooccurrence := COALESCE(v_w_cooccurrence, 0.10);
  v_w_positional := COALESCE(v_w_positional, 0.07);
  v_w_pattern := CASE WHEN COALESCE(v_pattern_enabled, true) THEN COALESCE(v_w_pattern, 0.05) ELSE 0 END;
  v_w_bayesian := COALESCE(v_w_bayesian, 0.03);
  v_w_trend := COALESCE(v_w_trend, 0.05);
  v_w_window_7d := COALESCE(v_w_window_7d, 0.05);
  v_w_window_15d := COALESCE(v_w_window_15d, 0.08);
  v_w_window_30d := COALESCE(v_w_window_30d, 0.15);
  v_w_window_60d := COALESCE(v_w_window_60d, 0.18);
  v_w_window_90d := COALESCE(v_w_window_90d, 0.20);
  v_w_window_180d := COALESCE(v_w_window_180d, 0.15);
  v_w_window_365d := COALESCE(v_w_window_365d, 0.10);
  v_w_window_full := COALESCE(v_w_window_full, 0.09);

  SELECT COUNT(*) INTO v_total_draws
  FROM public.draws d WHERE d.turno = p_turno AND d.date < p_date;

  RETURN QUERY
  WITH params AS (
    SELECT p_turno AS target_turno, p_date AS prediction_date, v_total_draws AS total_draws
  ),
  all_nums AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
      d.date AS draw_date, (d.date - p_date) AS days_ago,
      MOD(unnest(d.numbers), p_modulus) AS val
    FROM public.draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_raw AS (
    SELECT an.val AS n,
      SUM(CASE WHEN an.days_ago >= -7 THEN 1 ELSE 0 END) AS cnt_7d,
      SUM(CASE WHEN an.days_ago >= -15 THEN 1 ELSE 0 END) AS cnt_15d,
      SUM(CASE WHEN an.days_ago >= -30 THEN 1 ELSE 0 END) AS cnt_30d,
      SUM(CASE WHEN an.days_ago >= -60 THEN 1 ELSE 0 END) AS cnt_60d,
      SUM(CASE WHEN an.days_ago >= -90 THEN 1 ELSE 0 END) AS cnt_90d,
      SUM(CASE WHEN an.days_ago >= -180 THEN 1 ELSE 0 END) AS cnt_180d,
      SUM(CASE WHEN an.days_ago >= -365 THEN 1 ELSE 0 END) AS cnt_365d,
      COUNT(*) AS cnt_full
    FROM all_nums an GROUP BY an.val
  ),
  freq_score AS (
    SELECT fr.n,
      (fr.cnt_7d  * v_w_window_7d +
       fr.cnt_15d * v_w_window_15d +
       fr.cnt_30d * v_w_window_30d +
       fr.cnt_60d * v_w_window_60d +
       fr.cnt_90d * v_w_window_90d +
       fr.cnt_180d * v_w_window_180d +
       fr.cnt_365d * v_w_window_365d +
       fr.cnt_full * v_w_window_full
      ) AS score
    FROM freq_raw fr
  ),
  mx_freq AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM freq_score),
  bay AS (
    SELECT val AS n, (COUNT(*) + 1.0) / (v_total_draws + v_prior) AS posterior
    FROM all_nums GROUP BY val
  ),
  mx_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bay),
  last_head AS (
    SELECT MOD(d.numbers[1], 100) AS head
    FROM public.draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    ORDER BY d.date DESC, d.created_at DESC LIMIT 1
  ),
  mk_trans AS (
    SELECT MOD(unnest(d.numbers), p_modulus) AS n
    FROM public.draws d, params p, last_head lh
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
      AND d.date >= p.prediction_date - (v_markov_window || ' days')::INTERVAL
      AND MOD(d.numbers[1], 100) = lh.head
  ),
  mk AS (SELECT n, COUNT(*) AS cnt FROM mk_trans WHERE n IS NOT NULL GROUP BY n),
  mx_mk AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM mk),
  hot AS (
    SELECT val AS n, SUM(EXP(-v_decay * rn)) AS score
    FROM all_nums
    WHERE draw_date >= (SELECT prediction_date - INTERVAL '90 days' FROM params)
    GROUP BY val
  ),
  mx_hot AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM hot),
  ls AS (SELECT val AS n, MIN(rn) AS lr FROM all_nums GROUP BY val),
  cold AS (SELECT n, CASE WHEN lr > 0 THEN 1.0 / (1.0 + lr) ELSE 0 END AS score FROM ls),
  mx_cold AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM cold),
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
  t3 AS (SELECT val AS n FROM all_nums GROUP BY val ORDER BY COUNT(*) DESC LIMIT 3),
  co AS (
    SELECT a.val AS n, COUNT(*) AS cnt
    FROM all_nums a JOIN all_nums b ON a.rn = b.rn AND b.val IN (SELECT n FROM t3) AND a.val != b.val
    GROUP BY a.val
  ),
  mx_co AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM co),
  ps AS (
    SELECT MOD(d.numbers[1], p_modulus) AS n, 3 AS w FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[2], p_modulus) AS n, 2 FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[3], p_modulus) AS n, 1 FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  ps2 AS (SELECT n, SUM(w)::NUMERIC AS score FROM ps GROUP BY n),
  mx_ps AS (SELECT COALESCE(MAX(score), 1) AS mx FROM ps2),
  pattern AS (
    SELECT g.num AS n,
      CASE
        WHEN p_modulus = 1000 AND g.num % 111 = 0 THEN 0.3
        WHEN p_modulus = 10000 AND g.num % 1111 = 0 THEN 0.3
        ELSE 1.0
      END AS penalty
    FROM generate_series(p_series_start, p_series_end) g(num)
  ),
  trend AS (
    SELECT fr.n,
      CASE WHEN fr.cnt_full > 0
        THEN LEAST(1.0, (fr.cnt_30d::NUMERIC / GREATEST(fr.cnt_full, 1)) * 3.0)
        ELSE 0
      END AS score
    FROM freq_raw fr
  ),
  mx_trend AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM trend),
  all_sc AS (
    SELECT g.num AS num_val,
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
    FROM generate_series(p_series_start, p_series_end) g(num)
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
  )
  SELECT sc.num_val::INT,
    (v_w_frequency * sc.s_freq +
     v_w_markov * sc.s_markov +
     v_w_hot * sc.s_hot +
     v_w_cold * sc.s_cold +
     v_w_gap * sc.s_gap +
     v_w_cooccurrence * sc.s_coor +
     v_w_positional * sc.s_pos +
     v_w_pattern * (1.0 - sc.s_pattern) +
     v_w_bayesian * sc.s_bay +
     v_w_trend * sc.s_trend
    )::NUMERIC(7,5),
    jsonb_build_object(
      'frequency', round(sc.s_freq, 4),
      'markov', round(sc.s_markov, 4),
      'hot', round(sc.s_hot, 4),
      'cold', round(sc.s_cold, 4),
      'gap', round(sc.s_gap, 4),
      'cooccurrence', round(sc.s_coor, 4),
      'positional', round(sc.s_pos, 4),
      'pattern', round(sc.s_pattern, 4),
      'bayesian', round(sc.s_bay, 4),
      'trend', round(sc.s_trend, 4)
    )
  FROM all_sc sc
  ORDER BY (
    v_w_frequency * sc.s_freq +
    v_w_markov * sc.s_markov +
    v_w_hot * sc.s_hot +
    v_w_cold * sc.s_cold +
    v_w_gap * sc.s_gap +
    v_w_cooccurrence * sc.s_coor +
    v_w_positional * sc.s_pos +
    v_w_pattern * (1.0 - sc.s_pattern) +
    v_w_bayesian * sc.s_bay +
    v_w_trend * sc.s_trend
  ) DESC LIMIT 10;
END;
$$;

-- 3. api wrapper for score_numbers_v6
CREATE OR REPLACE FUNCTION api.score_numbers_v6(
  p_turno TEXT, p_date DATE, p_digit_space TEXT,
  p_modulus INT, p_series_start INT, p_series_end INT
)
RETURNS TABLE (numero INT, score_val NUMERIC(7,5), factor_attr JSONB)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.score_numbers_v6(
    p_turno, p_date, p_digit_space, p_modulus, p_series_start, p_series_end
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api.score_numbers_v6(text, date, text, integer, integer, integer) TO service_role;

-- 4. Recreate calculate_omega_v6 with explicit public. schema refs + score_numbers_v6 for 3/4 cifras
DROP FUNCTION IF EXISTS public.calculate_omega_v6(text, text, date) CASCADE;
DROP FUNCTION IF EXISTS api.calculate_omega_v6(text, text, date) CASCADE;

CREATE OR REPLACE FUNCTION public.calculate_omega_v6(
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
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  cfg RECORD;
  v_decay NUMERIC;
  v_markov_window INT;
  v_prior NUMERIC;
  v_total_draws INT;
BEGIN
  SELECT * INTO cfg
  FROM public.engine_config
  WHERE engine_version = 'omega_v6' AND turno = p_turno
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT * INTO cfg
    FROM public.engine_config
    WHERE engine_version = 'omega_v6' AND turno = 'ALL'
    LIMIT 1;
  END IF;

  v_decay := COALESCE(cfg.decay_lambda, 0.02);
  v_markov_window := COALESCE(cfg.markov_window_days, 90);
  v_prior := COALESCE(cfg.bayesian_prior, 100);

  SELECT COUNT(*) INTO v_total_draws
  FROM public.draws d WHERE d.turno = p_turno AND d.date < p_date;

  RETURN QUERY
  WITH params AS (
    SELECT p_turno AS target_turno, p_date AS prediction_date, v_total_draws AS total_draws
  ),
  all_nums AS (
    SELECT
      ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
      d.date AS draw_date, (d.date - p_date) AS days_ago,
      MOD(unnest(d.numbers), 100) AS val
    FROM public.draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_raw AS (
    SELECT an.val AS n,
      SUM(CASE WHEN an.days_ago >= -7  THEN 1 ELSE 0 END) AS cnt_7d,
      SUM(CASE WHEN an.days_ago >= -15 THEN 1 ELSE 0 END) AS cnt_15d,
      SUM(CASE WHEN an.days_ago >= -30 THEN 1 ELSE 0 END) AS cnt_30d,
      SUM(CASE WHEN an.days_ago >= -60 THEN 1 ELSE 0 END) AS cnt_60d,
      SUM(CASE WHEN an.days_ago >= -90 THEN 1 ELSE 0 END) AS cnt_90d,
      SUM(CASE WHEN an.days_ago >= -180 THEN 1 ELSE 0 END) AS cnt_180d,
      SUM(CASE WHEN an.days_ago >= -365 THEN 1 ELSE 0 END) AS cnt_365d,
      COUNT(*) AS cnt_full
    FROM all_nums an GROUP BY an.val
  ),
  freq_score AS (
    SELECT fr.n,
      (fr.cnt_7d  * COALESCE(cfg.w_window_7d, 0.05)  +
       fr.cnt_15d * COALESCE(cfg.w_window_15d, 0.08) +
       fr.cnt_30d * COALESCE(cfg.w_window_30d, 0.15) +
       fr.cnt_60d * COALESCE(cfg.w_window_60d, 0.18) +
       fr.cnt_90d * COALESCE(cfg.w_window_90d, 0.20) +
       fr.cnt_180d * COALESCE(cfg.w_window_180d, 0.15) +
       fr.cnt_365d * COALESCE(cfg.w_window_365d, 0.10) +
       fr.cnt_full * COALESCE(cfg.w_window_full, 0.09)
      ) AS score
    FROM freq_raw fr
  ),
  mx_freq AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM freq_score),
  bay AS (
    SELECT val AS n, (COUNT(*) + 1.0) / (v_total_draws + v_prior) AS posterior
    FROM all_nums GROUP BY val
  ),
  mx_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bay),
  last_head AS (
    SELECT MOD(d.numbers[1], 100) AS head
    FROM public.draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    ORDER BY d.date DESC, d.created_at DESC LIMIT 1
  ),
  mk_trans AS (
    SELECT MOD(unnest(d.numbers[1:20]), 100) AS n
    FROM public.draws d, params p, last_head lh
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
      AND d.date >= p.prediction_date - (v_markov_window || ' days')::INTERVAL
      AND MOD(d.numbers[1], 100) = lh.head
  ),
  mk AS (SELECT n, COUNT(*) AS cnt FROM mk_trans WHERE n IS NOT NULL GROUP BY n),
  mx_mk AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM mk),
  hot AS (
    SELECT val AS n, SUM(EXP(-v_decay * rn)) AS score
    FROM all_nums
    WHERE draw_date >= (SELECT prediction_date - INTERVAL '90 days' FROM params)
    GROUP BY val
  ),
  mx_hot AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM hot),
  ls AS (SELECT val AS n, MIN(rn) AS lr FROM all_nums GROUP BY val),
  cold AS (
    SELECT n, CASE WHEN lr > 0 THEN 1.0 / (1.0 + lr) ELSE 0 END AS score FROM ls
  ),
  mx_cold AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM cold),
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
  t3 AS (SELECT val AS n FROM all_nums GROUP BY val ORDER BY COUNT(*) DESC LIMIT 3),
  co AS (
    SELECT a.val AS n, COUNT(*) AS cnt
    FROM all_nums a
    JOIN all_nums b ON a.rn = b.rn AND b.val IN (SELECT n FROM t3) AND a.val != b.val
    GROUP BY a.val
  ),
  mx_co AS (SELECT COALESCE(MAX(cnt), 1) AS mx FROM co),
  ps AS (
    SELECT MOD(d.numbers[1], 100) AS n, 3 AS w FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[2], 100) AS n, 2 FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[3], 100) AS n, 1 FROM public.draws d, params p WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  ps2 AS (SELECT n, SUM(w)::NUMERIC AS score FROM ps GROUP BY n),
  mx_ps AS (SELECT COALESCE(MAX(score), 1) AS mx FROM ps2),
  pattern AS (
    SELECT g.num AS n,
      CASE
        WHEN g.num % 11 = 0 THEN 0.3
        WHEN g.num BETWEEN 1 AND 9 THEN 0.7
        ELSE 1.0
      END AS penalty
    FROM generate_series(0, 99) g(num)
  ),
  trend AS (
    SELECT fr.n,
      CASE WHEN fr.cnt_full > 0
        THEN LEAST(1.0, (fr.cnt_30d::NUMERIC / GREATEST(fr.cnt_full, 1)) * 3.0)
        ELSE 0
      END AS score
    FROM freq_raw fr
  ),
  mx_trend AS (SELECT COALESCE(MAX(score), 0.001) AS mx FROM trend),
  all_sc AS (
    SELECT g.num AS num_val,
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
    SELECT num_val,
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
    FROM scored s WHERE s.score_val > 0
    ORDER BY s.score_val DESC LIMIT 10
  ),

  -- 3 CIFRAS: full 10-factor analysis via score_numbers_v6
  t3_scores AS (
    SELECT s.numero AS num_val
    FROM public.score_numbers_v6(p_turno, p_date, '3', 1000, 0, 999) s
    ORDER BY s.score_val DESC LIMIT 10
  ),

  -- 4 CIFRAS: full 10-factor analysis via score_numbers_v6
  t4_scores AS (
    SELECT s.numero AS num_val
    FROM public.score_numbers_v6(p_turno, p_date, '4', 10000, 0, 9999) s
    ORDER BY s.score_val DESC LIMIT 10
  ),

  -- REDOBLONA
  pair_data AS (
    SELECT DISTINCT d.date, LPAD(MOD(v, 100)::TEXT, 2, '0') AS ambo
    FROM public.draws d, unnest(d.numbers) v, params p
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
  t3_arr AS (SELECT array_agg(num_val ORDER BY num_val) AS arr FROM t3_scores),
  t4_arr AS (SELECT array_agg(num_val ORDER BY num_val) AS arr FROM t4_scores),
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
    FROM top_2c t2c ORDER BY t2c.score_val DESC OFFSET 1
  )
  SELECT * FROM first_row WHERE first_row.numero IS NOT NULL
  UNION ALL
  SELECT * FROM remaining_rows;
END;
$$;

-- 5. api wrapper for calculate_omega_v6
CREATE OR REPLACE FUNCTION api.calculate_omega_v6(
  p_turno TEXT, p_tier TEXT DEFAULT 'free', p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  numero INT, puntaje_total NUMERIC, prediccion_2cifras TEXT,
  prediccion_3cifras JSONB, prediccion_4cifras JSONB,
  redoblona JSONB, factor_attribution JSONB
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.calculate_omega_v6(p_turno, p_tier, p_date);
END;
$$;

GRANT EXECUTE ON FUNCTION api.calculate_omega_v6(text, text, date) TO service_role;
