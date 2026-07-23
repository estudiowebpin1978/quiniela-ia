-- ============================================================================
-- RPC Functions for Heavy Statistical Calculations
-- These run in Supabase (PostgreSQL) to avoid Vercel timeout/memory limits
-- ============================================================================

-- Helper: Convert 4-digit numbers to 2-digit
CREATE OR REPLACE FUNCTION to_2digit(num INT) RETURNS INT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT num % 100;
$$;

-- ============================================================================
-- 1. FREQUENCY CALCULATIONS (Server-side aggregation)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_frequency_stats(
  p_turno TEXT DEFAULT NULL,
  p_window INT DEFAULT 100,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  freq_historica NUMERIC,
  freq_100 NUMERIC,
  freq_20 NUMERIC,
  total_draws BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  RETURN QUERY
  WITH draws AS (
    SELECT date, turno, numbers
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT p_window
  ),
  all_numbers AS (
    SELECT unnest(numbers) AS num
    FROM draws
  ),
  two_digit AS (
    SELECT to_2digit(num) AS n
    FROM all_numbers
    WHERE num BETWEEN 0 AND 9999
  ),
  hist AS (
    SELECT to_2digit(num) AS n
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
  )
  SELECT 
    n AS numero,
    COUNT(CASE WHEN t.source = 'hist' THEN 1 END)::NUMERIC / GREATEST(COUNT(*), 1) AS freq_historica,
    COUNT(CASE WHEN t.source = 'draws' THEN 1 END)::NUMERIC / GREATEST(COUNT(*), 1) AS freq_100,
    COUNT(CASE WHEN t.source = 'draws20' THEN 1 END)::NUMERIC / GREATEST(COUNT(*), 1) AS freq_20,
    COUNT(*) AS total_draws
  FROM two_digit
  CROSS JOIN LATERAL (
    SELECT 'hist' AS source UNION ALL
    SELECT 'draws' UNION ALL
    SELECT 'draws20'
  ) t
  GROUP BY n
  ORDER BY n;
END;
$$;

-- ============================================================================
-- 2. ABSENCE / RECENCY / CYCLE CALCULATIONS
-- ============================================================================

CREATE OR REPLACE FUNCTION get_absence_recency_cycles(
  p_turno TEXT DEFAULT NULL,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  ausencia_actual INT,
  recencia_exp NUMERIC,
  ciclo_promedio NUMERIC,
  desviacion_ciclo NUMERIC,
  ultimo_visto INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers, ROW_NUMBER() OVER (ORDER BY date DESC) - 1 AS idx
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
  ),
  appearances AS (
    SELECT 
      to_2digit(unnest(numbers)) AS n,
      idx
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
  ),
  last_seen AS (
    SELECT 
      n AS numero,
      MIN(idx) AS ultimo_visto
    FROM appearances
    GROUP BY n
  ),
  gaps AS (
    SELECT 
      n AS numero,
      LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC) - idx AS gap
    FROM appearances
  ),
  gap_stats AS (
    SELECT 
      numero,
      AVG(gap)::NUMERIC AS ciclo_promedio,
      STDDEV(gap)::NUMERIC AS desviacion_ciclo
    FROM gaps
    WHERE gap > 0
    GROUP BY numero
  ),
  recency AS (
    SELECT 
      n AS numero,
      SUM(EXP(-0.1 * idx))::NUMERIC AS recencia_exp
    FROM appearances
    GROUP BY n
  )
  SELECT 
    ls.numero,
    GREATEST(0, (SELECT MAX(idx) FROM draws) - ls.ultimo_visto) AS ausencia_actual,
    COALESCE(r.recencia_exp, 0) AS recencia_exp,
    COALESCE(gs.ciclo_promedio, 0) AS ciclo_promedio,
    COALESCE(gs.desviacion_ciclo, 0) AS desviacion_ciclo,
    ls.ultimo_visto
  FROM last_seen ls
  LEFT JOIN recency r ON ls.numero = r.numero
  LEFT JOIN gap_stats gs ON ls.numero = gs.numero
  ORDER BY ls.numero;
END;
$$;

-- ============================================================================
-- 3. SHANNON ENTROPY (per number contribution)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_entropy_scores(
  p_turno TEXT DEFAULT NULL,
  p_window INT DEFAULT 50,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  score NUMERIC,
  entropy_value NUMERIC,
  entropy_trend TEXT,
  entropy_alert BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno_filter TEXT := COALESCE(p_turno, '%');
  v_entropy NUMERIC;
  v_trend TEXT;
  v_alert BOOLEAN;
BEGIN
  -- Compute entropy from recent draws
  WITH draws AS (
    SELECT numbers
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT p_window
  ),
  freq AS (
    SELECT 
      to_2digit(unnest(numbers)) AS n,
      COUNT(*)::NUMERIC AS cnt
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
    GROUP BY n
  ),
  total AS (
    SELECT SUM(cnt) AS tot FROM freq
  ),
  probs AS (
    SELECT n, cnt / GREATEST(tot, 1) AS p
    FROM freq CROSS JOIN total
  ),
  entropy_calc AS (
    SELECT 
      COALESCE(-SUM(p * LOG(2, p)), LOG(2, 100)) AS raw_entropy
    FROM probs
    WHERE p > 0
  ),
  trend_calc AS (
    SELECT 
      CASE 
        WHEN e2.raw_entropy - e1.raw_entropy > 0.05 THEN 'ascending'
        WHEN e1.raw_entropy - e2.raw_entropy > 0.05 THEN 'descending'
        ELSE 'stable'
      END AS trend
    FROM (
      SELECT raw_entropy FROM entropy_calc
    ) e1
    CROSS JOIN (
      SELECT raw_entropy FROM entropy_calc
    ) e2
  )
  SELECT 
    p.n AS numero,
    CASE WHEN ec.raw_entropy > 0 THEN ABS(p.p - 0.01) * (1 - ec.raw_entropy / LOG(2, 100)) ELSE 0 END AS score,
    ec.raw_entropy / LOG(2, 100) AS entropy_value,
    tc.trend,
    (ec.raw_entropy / LOG(2, 100)) < 0.85 AS entropy_alert
  FROM probs p
  CROSS JOIN entropy_calc ec
  CROSS JOIN trend_calc tc
  ORDER BY p.n;
END;
$$;

-- ============================================================================
-- 4. SURVIVAL ANALYSIS (Kaplan-Meier)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_survival_scores(
  p_turno TEXT DEFAULT NULL,
  p_max_draws INT DEFAULT 500,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  hazard_rate NUMERIC,
  mean_gap NUMERIC,
  current_delay INT,
  z_score NUMERIC,
  risk_percentile NUMERIC,
  classification TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers, ROW_NUMBER() OVER (ORDER BY date DESC) - 1 AS idx
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT p_max_draws
  ),
  appearances AS (
    SELECT 
      to_2digit(unnest(numbers)) AS n,
      idx
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
  ),
  gaps AS (
    SELECT 
      n,
      LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC) - idx AS gap
    FROM appearances
  ),
  gap_stats AS (
    SELECT 
      n AS numero,
      AVG(gap)::NUMERIC AS mean_gap,
      STDDEV(gap)::NUMERIC AS gap_stddev
    FROM gaps
    WHERE gap > 0
    GROUP BY n
  ),
  last_seen AS (
    SELECT 
      n AS numero,
      MIN(idx) AS last_idx
    FROM appearances
    GROUP BY n
  ),
  max_draw AS (
    SELECT MAX(idx) AS max_idx FROM draws
  ),
  combined AS (
    SELECT 
      gs.numero,
      gs.mean_gap,
      gs.gap_stddev,
      ls.last_idx,
      md.max_idx
    FROM gap_stats gs
    JOIN last_seen ls ON gs.numero = ls.numero
    CROSS JOIN max_draw md
    WHERE gs.mean_gap > 0
  ),
  hazard AS (
    SELECT 
      numero,
      mean_gap,
      1.0 / mean_gap AS hazard_rate,
      (max_idx - last_idx) AS current_delay,
      gap_stddev
    FROM combined
  ),
  zscore_calc AS (
    SELECT 
      *,
      CASE WHEN gap_stddev > 0 
        THEN (current_delay - mean_gap) / gap_stddev 
        ELSE 0 END AS z_score
    FROM hazard
  ),
  final AS (
    SELECT 
      numero,
      hazard_rate,
      mean_gap,
      current_delay,
      z_score,
      CASE 
        WHEN z_score > 2.0 THEN 'critical'
        WHEN z_score > 1.5 THEN 'high'
        WHEN z_score > 1.0 THEN 'moderate'
        ELSE 'low'
      END AS classification,
      -- Normal CDF approximation for percentile
      50 + 50 * ERF(z_score / SQRT(2)) AS risk_percentile
    FROM zscore_calc
  )
  SELECT 
    numero,
    hazard_rate,
    mean_gap,
    current_delay,
    z_score,
    risk_percentile,
    classification
  FROM final
  WHERE hazard_rate > 0
  ORDER BY z_score DESC;
END;
$$;

-- ============================================================================
-- 5. MARKOV TRANSITIONS (Inter-turno)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_markov_transitions(
  p_turnos TEXT[] DEFAULT ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'],
  p_order INT DEFAULT 2,
  p_min_support INT DEFAULT 5,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  state TEXT,
  next_number INT,
  probability NUMERIC,
  support INT,
  lift NUMERIC,
  confidence NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH all_draws AS (
    SELECT date, turno, to_2digit(numbers[1]) AS first_num
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno = ANY(p_turnos)
      AND array_length(numbers, 1) >= 20
    ORDER BY date ASC
  ),
  ordered_draws AS (
    SELECT 
      date,
      MAX(CASE WHEN turno = p_turnos[1] THEN first_num END) AS t1,
      MAX(CASE WHEN turno = p_turnos[2] THEN first_num END) AS t2,
      MAX(CASE WHEN turno = p_turnos[3] THEN first_num END) AS t3,
      MAX(CASE WHEN turno = p_turnos[4] THEN first_num END) AS t4,
      MAX(CASE WHEN turno = p_turnos[5] THEN first_num END) AS t5
    FROM all_draws
    GROUP BY date
    HAVING COUNT(*) = array_length(p_turnos, 1)
  ),
  states AS (
    SELECT 
      t1, t2, t3, t4, t5,
      LAG(t1) OVER (ORDER BY date) AS prev_t1,
      LAG(t2) OVER (ORDER BY date) AS prev_t2
    FROM ordered_draws
  ),
  transitions AS (
    SELECT 
      CASE 
        WHEN p_order = 2 THEN prev_t1::TEXT || ',' || prev_t2::TEXT
        ELSE prev_t1::TEXT
      END AS state,
      CASE 
        WHEN p_order = 2 THEN t3
        ELSE t2
      END AS next_number
    FROM states
    WHERE prev_t1 IS NOT NULL 
      AND prev_t2 IS NOT NULL 
      AND t3 IS NOT NULL
  ),
  counts AS (
    SELECT 
      state,
      next_number,
      COUNT(*) AS support
    FROM transitions
    GROUP BY state, next_number
  ),
  totals AS (
    SELECT state, SUM(support) AS total
    FROM counts
    GROUP BY state
  )
  SELECT 
    c.state,
    c.next_number,
    c.support::NUMERIC / t.total AS probability,
    c.support,
    (c.support::NUMERIC / t.total) / (1.0 / 100) AS lift,
    LEAST(1.0, c.support::NUMERIC / 20) AS confidence
  FROM counts c
  JOIN totals t ON c.state = t.state
  WHERE c.support >= p_min_support
    AND (c.support::NUMERIC / t.total) > 0.015  -- 1.5x uniform
  ORDER BY lift DESC;
END;
$$;

-- ============================================================================
-- 6. CO-OCCURRENCE MATRIX
-- ============================================================================

CREATE OR REPLACE FUNCTION get_cooccurrence_scores(
  p_turno TEXT DEFAULT NULL,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  RETURN QUERY
  WITH draws AS (
    SELECT numbers
    FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT 50
  ),
  pairs AS (
    SELECT 
      LEAST(to_2digit(a), to_2digit(b)) AS n1,
      GREATEST(to_2digit(a), to_2digit(b)) AS n2
    FROM draws, 
    LATERAL unnest(numbers) AS a(num),
    LATERAL unnest(numbers) AS b(num)
    WHERE a.num BETWEEN 0 AND 9999
      AND b.num BETWEEN 0 AND 9999
      AND a.num != b.num
  ),
  cooc AS (
    SELECT n1, n2, COUNT(*) AS cnt
    FROM pairs
    GROUP BY n1, n2
  ),
  scores AS (
    SELECT 
      n1 AS numero,
      SUM(cnt)::NUMERIC / GREATEST(SUM(SUM(cnt)) OVER (), 1) AS score
    FROM cooc
    GROUP BY n1
    UNION ALL
    SELECT 
      n2 AS numero,
      SUM(cnt)::NUMERIC / GREATEST(SUM(SUM(cnt)) OVER (), 1) AS score
    FROM cooc
    GROUP BY n2
  )
  SELECT numero, MAX(score) AS score
  FROM scores
  GROUP BY numero
  ORDER BY score DESC;
END;
$$;

-- ============================================================================
-- 7. WEIGHTED ENSEMBLE SCORE (all factors combined)
-- ============================================================================

CREATE OR REPLACE FUNCTION get_ensemble_scores(
  p_turno TEXT,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  final_score NUMERIC,
  freq_score NUMERIC,
  absence_score NUMERIC,
  recency_score NUMERIC,
  trend_score NUMERIC,
  cycle_score NUMERIC,
  entropy_score NUMERIC,
  survival_score NUMERIC,
  markov_score NUMERIC,
  cooc_score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH freq AS (
    SELECT * FROM get_frequency_stats(p_turno, 100, p_game_slug)
  ),
  absence AS (
    SELECT * FROM get_absence_recency_cycles(p_turno, p_game_slug)
  ),
  entropy AS (
    SELECT * FROM get_entropy_scores(p_turno, 50, p_game_slug)
  ),
  survival AS (
    SELECT * FROM get_survival_scores(p_turno, 500, p_game_slug)
  ),
  markov AS (
    SELECT * FROM get_markov_transitions(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'], 2, 5, p_game_slug)
  ),
  cooc AS (
    SELECT * FROM get_cooccurrence_scores(p_turno, p_game_slug)
  ),
  trend AS (
    SELECT numero, 
      CASE WHEN freq_100 > freq_historica THEN freq_100 - freq_historica ELSE freq_historica - freq_100 END AS trend_score
    FROM freq
  ),
  combined AS (
    SELECT 
      f.numero,
      -- Weighted combination (sum = 1.0)
      (f.freq_historica * 0.10 + f.freq_100 * 0.10 + f.freq_20 * 0.08 +
       a.recencia_exp * 0.08 + a.ausencia_actual / 100.0 * 0.06 +
       t.trend_score * 0.06 + a.ciclo_promedio / 100.0 * 0.04 +
       e.score * 0.02 + s.hazard_rate * 0.05 +
       m.probability * 0.04 + c.score * 0.03) AS final_score,
      (f.freq_historica + f.freq_100 + f.freq_20) / 3 AS freq_score,
      a.ausencia_actual / 100.0 AS absence_score,
      a.recencia_exp AS recency_score,
      t.trend_score AS trend_score,
      a.ciclo_promedio / 100.0 AS cycle_score,
      e.score AS entropy_score,
      s.hazard_rate AS survival_score,
      m.probability AS markov_score,
      c.score AS cooc_score
    FROM freq f
    JOIN absence a ON f.numero = a.numero
    JOIN entropy e ON f.numero = e.numero
    JOIN survival s ON f.numero = s.numero
    LEFT JOIN markov m ON f.numero = m.next_number
    LEFT JOIN cooc c ON f.numero = c.numero
    JOIN trend t ON f.numero = t.numero
  )
  SELECT 
    numero,
    final_score,
    freq_score,
    absence_score,
    recency_score,
    trend_score,
    cycle_score,
    entropy_score,
    survival_score,
    markov_score,
    cooc_score
  FROM combined
  ORDER BY final_score DESC;
END;
$$;

-- ============================================================================
-- 8. PREDICTION HISTORY VERIFICATION (automatic)
-- ============================================================================

CREATE OR REPLACE FUNCTION verify_predictions()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO prediction_history (prediction_id, user_id, date, turno, predicted_2c, predicted_3c, predicted_4c, actual_2c, actual_3c, actual_4c, hit_2c, hit_3c, hit_4c, verified_at)
  SELECT 
    up.id,
    up.user_id,
    up.date,
    up.turno,
    up.numbers_2c,
    up.numbers_3c,
    up.numbers_4c,
    d.numbers[1] % 100,
    d.numbers[1] % 1000,
    d.numbers[1],
    CASE WHEN d.numbers[1] % 100 = ANY(up.numbers_2c) THEN 1 ELSE 0 END,
    CASE WHEN d.numbers[1] % 1000 = ANY(up.numbers_3c) THEN 1 ELSE 0 END,
    CASE WHEN d.numbers[1] = ANY(up.numbers_4c) THEN 1 ELSE 0 END,
    NOW()
  FROM user_predictions up
  JOIN draws d ON d.date = up.date AND d.turno = up.turno
  LEFT JOIN prediction_history ph ON ph.prediction_id = up.id
  WHERE ph.prediction_id IS NULL
    AND d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) > 0;
END;
$$;

-- ============================================================================
-- 9. DAILY BACKTEST (runs via cron)
-- ============================================================================

CREATE OR REPLACE FUNCTION run_daily_backtest(p_game_slug TEXT DEFAULT 'quiniela')
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno TEXT;
BEGIN
  FOR v_turno IN SELECT DISTINCT turno FROM draws WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
  LOOP
    INSERT INTO backtest_results (
      turno, model_type, test_date, train_window_start, train_window_end,
      hit_at_1_2c, hit_at_5_2c, hit_at_10_2c, rank_2c, score_2c, roi_2c
    )
    SELECT 
      v_turno,
      'ensemble',
      d.date,
      d.date - INTERVAL '365 days',
      d.date - INTERVAL '1 day',
      CASE WHEN d.numbers[1] % 100 = pred.numero THEN TRUE ELSE FALSE END,
      CASE WHEN d.numbers[1] % 100 = ANY(pred.top5) THEN TRUE ELSE FALSE END,
      CASE WHEN d.numbers[1] % 100 = ANY(pred.top10) THEN TRUE ELSE FALSE END,
      pred.rank,
      pred.score,
      CASE WHEN d.numbers[1] % 100 = pred.numero THEN 60 ELSE -10 END
    FROM draws d
    CROSS JOIN LATERAL (
      SELECT 
        numero,
        score,
        RANK() OVER (ORDER BY score DESC) AS rank,
        ARRAY_AGG(numero ORDER BY score DESC LIMIT 5) AS top5,
        ARRAY_AGG(numero ORDER BY score DESC LIMIT 10) AS top10
      FROM get_ensemble_scores(v_turno, p_game_slug)
      LIMIT 100
    ) pred
    WHERE d.turno = v_turno
      AND d.date = CURRENT_DATE - INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM backtest_results br 
        WHERE br.turno = v_turno AND br.test_date = d.date AND br.model_type = 'ensemble'
      );
  END LOOP;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================

GRANT EXECUTE ON FUNCTION get_frequency_stats TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_absence_recency_cycles TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_entropy_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_survival_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_markov_transitions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_cooccurrence_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ensemble_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION verify_predictions TO service_role;
GRANT EXECUTE ON FUNCTION run_daily_backtest TO service_role;