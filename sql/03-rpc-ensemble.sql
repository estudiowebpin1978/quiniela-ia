-- ============================================================================
-- 03-rpc-ensemble.sql: Core RPC functions (fully idempotent)
-- All reference draws.date and turn_analytics.fecha
-- ============================================================================

-- Helper
CREATE OR REPLACE FUNCTION to_2digit(num INT) RETURNS INT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT num % 100;
$$;

-- ============================================================================
-- 1. FREQUENCY STATS
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
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH recent AS (
    SELECT numbers FROM draws
    WHERE game_id = v_game_id
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT p_window
  ),
  freq_full AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM recent WHERE unnest(numbers) BETWEEN 0 AND 9999
    GROUP BY n
  ),
  freq_20 AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM (
      SELECT numbers FROM draws
      WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
        AND array_length(numbers, 1) >= 20
      ORDER BY date DESC LIMIT 20
    ) sub, unnest(sub.numbers) AS unnest(numbers)
    WHERE unnest(numbers) BETWEEN 0 AND 9999
    GROUP BY n
  ),
  freq_hist AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM (
      SELECT numbers FROM draws
      WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
        AND array_length(numbers, 1) >= 20
      ORDER BY date DESC LIMIT 500
    ) sub, unnest(sub.numbers) AS unnest(numbers)
    WHERE unnest(numbers) BETWEEN 0 AND 9999
    GROUP BY n
  ),
  nums AS (
    SELECT generate_series(0, 99) AS n
  )
  SELECT
    nums.n AS numero,
    COALESCE(fh.cnt / GREATEST(p_window, 1), 0) AS freq_historica,
    COALESCE(ff.cnt / GREATEST(p_window, 1), 0) AS freq_100,
    COALESCE(f2.cnt / GREATEST(20, 1), 0) AS freq_20,
    p_window::BIGINT AS total_draws
  FROM nums
  LEFT JOIN freq_hist fh ON nums.n = fh.n
  LEFT JOIN freq_full ff ON nums.n = ff.n
  LEFT JOIN freq_20 f2 ON nums.n = f2.n
  ORDER BY nums.n;
END;
$$;

-- ============================================================================
-- 2. ABSENCE / RECENCY / CYCLES
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
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers,
           ROW_NUMBER() OVER (ORDER BY date DESC) - 1 AS idx
    FROM draws
    WHERE game_id = v_game_id
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT 500
  ),
  appearances AS (
    SELECT to_2digit(unnest(numbers)) AS n, idx
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
  ),
  last_seen AS (
    SELECT n AS numero, MIN(idx) AS ultimo_visto
    FROM appearances GROUP BY n
  ),
  gaps AS (
    SELECT n AS numero,
           LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC) - idx AS gap
    FROM appearances
  ),
  gap_stats AS (
    SELECT numero,
           AVG(gap)::NUMERIC AS ciclo_promedio,
           STDDEV(gap)::NUMERIC AS desviacion_ciclo
    FROM gaps WHERE gap > 0 GROUP BY numero
  ),
  recency AS (
    SELECT n AS numero,
           SUM(EXP(-0.1 * idx))::NUMERIC AS recencia_exp
    FROM appearances GROUP BY n
  ),
  max_idx AS (
    SELECT MAX(idx) AS mx FROM draws
  )
  SELECT
    ls.numero,
    GREATEST(0, mi.mx - ls.ultimo_visto) AS ausencia_actual,
    COALESCE(r.recencia_exp, 0) AS recencia_exp,
    COALESCE(gs.ciclo_promedio, 0) AS ciclo_promedio,
    COALESCE(gs.desviacion_ciclo, 0) AS desviacion_ciclo,
    ls.ultimo_visto
  FROM last_seen ls
  CROSS JOIN max_idx mi
  LEFT JOIN recency r ON ls.numero = r.numero
  LEFT JOIN gap_stats gs ON ls.numero = gs.numero
  ORDER BY ls.numero;
END;
$$;

-- ============================================================================
-- 3. SHANNON ENTROPY
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
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
  v_max_entropy NUMERIC;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  v_max_entropy := LOG(2, 100);

  RETURN QUERY
  WITH draws AS (
    SELECT numbers FROM draws
    WHERE game_id = v_game_id
      AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT p_window
  ),
  freq AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999 GROUP BY n
  ),
  total AS (SELECT SUM(cnt) AS tot FROM freq),
  probs AS (SELECT n, cnt / GREATEST(tot, 1) AS p FROM freq CROSS JOIN total),
  entropy_calc AS (
    SELECT COALESCE(-SUM(p * LOG(2, p)), v_max_entropy) AS raw_entropy
    FROM probs WHERE p > 0
  )
  SELECT
    p.n AS numero,
    CASE WHEN ec.raw_entropy > 0 THEN ABS(p.p - 0.01) * (1 - ec.raw_entropy / v_max_entropy) ELSE 0 END AS score,
    ec.raw_entropy / v_max_entropy AS entropy_value,
    'stable'::TEXT AS entropy_trend,
    (ec.raw_entropy / v_max_entropy) < 0.85 AS entropy_alert
  FROM probs p CROSS JOIN entropy_calc ec
  ORDER BY p.n;
END;
$$;

-- ============================================================================
-- 4. SURVIVAL ANALYSIS
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
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers,
           ROW_NUMBER() OVER (ORDER BY date DESC) - 1 AS idx
    FROM draws
    WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT p_max_draws
  ),
  appearances AS (
    SELECT to_2digit(unnest(numbers)) AS n, idx
    FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999
  ),
  gaps AS (
    SELECT n, LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC) - idx AS gap FROM appearances
  ),
  gap_stats AS (
    SELECT n AS numero, AVG(gap)::NUMERIC AS mean_gap, STDDEV(gap)::NUMERIC AS gap_std
    FROM gaps WHERE gap > 0 GROUP BY n HAVING AVG(gap) > 0
  ),
  last_seen AS (
    SELECT n AS numero, MIN(idx) AS last_idx FROM appearances GROUP BY n
  ),
  max_idx AS (SELECT MAX(idx) AS mx FROM draws)
  SELECT
    gs.numero,
    1.0 / gs.mean_gap AS hazard_rate,
    gs.mean_gap,
    (mi.mx - ls.last_idx) AS current_delay,
    CASE WHEN gs.gap_std > 0
      THEN (mi.mx - ls.last_idx - gs.mean_gap) / gs.gap_std ELSE 0 END AS z_score,
    (50 + 50 * ERF((mi.mx - ls.last_idx - gs.mean_gap) / GREATEST(gs.gap_std, 1) / SQRT(2))) AS risk_percentile,
    CASE
      WHEN (mi.mx - ls.last_idx - gs.mean_gap) / GREATEST(gs.gap_std, 1) > 2.0 THEN 'critical'
      WHEN (mi.mx - ls.last_idx - gs.mean_gap) / GREATEST(gs.gap_std, 1) > 1.5 THEN 'high'
      WHEN (mi.mx - ls.last_idx - gs.mean_gap) / GREATEST(gs.gap_std, 1) > 1.0 THEN 'moderate'
      ELSE 'low'
    END AS classification
  FROM gap_stats gs
  JOIN last_seen ls ON gs.numero = ls.numero
  CROSS JOIN max_idx mi
  ORDER BY z_score DESC;
END;
$$;

-- ============================================================================
-- 5. MARKOV TRANSITIONS
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
DECLARE
  v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH all_draws AS (
    SELECT date, turno, to_2digit(numbers[1]) AS first_num
    FROM draws
    WHERE game_id = v_game_id AND turno = ANY(p_turnos)
      AND array_length(numbers, 1) >= 20
    ORDER BY date ASC
  ),
  pivoted AS (
    SELECT date,
      MAX(CASE WHEN turno = p_turnos[1] THEN first_num END) AS t1,
      MAX(CASE WHEN turno = p_turnos[2] THEN first_num END) AS t2,
      MAX(CASE WHEN turno = p_turnos[3] THEN first_num END) AS t3,
      MAX(CASE WHEN turno = p_turnos[4] THEN first_num END) AS t4,
      MAX(CASE WHEN turno = p_turnos[5] THEN first_num END) AS t5
    FROM all_draws GROUP BY date
    HAVING COUNT(DISTINCT turno) = array_length(p_turnos, 1)
  ),
  states AS (
    SELECT *, LAG(t1) OVER (ORDER BY date) AS prev_t1, LAG(t2) OVER (ORDER BY date) AS prev_t2
    FROM pivoted
  ),
  transitions AS (
    SELECT
      CASE WHEN p_order = 2 THEN prev_t1::TEXT || ',' || prev_t2::TEXT ELSE prev_t1::TEXT END AS state,
      CASE WHEN p_order = 2 THEN t3 ELSE t2 END AS next_number
    FROM states WHERE prev_t1 IS NOT NULL AND prev_t2 IS NOT NULL AND t3 IS NOT NULL
  ),
  counts AS (
    SELECT state, next_number, COUNT(*) AS support FROM transitions GROUP BY state, next_number
  ),
  totals AS (SELECT state, SUM(support) AS total FROM counts GROUP BY state)
  SELECT c.state, c.next_number,
    c.support::NUMERIC / t.total AS probability, c.support,
    (c.support::NUMERIC / t.total) / 0.01 AS lift,
    LEAST(1.0, c.support::NUMERIC / 20) AS confidence
  FROM counts c JOIN totals t ON c.state = t.state
  WHERE c.support >= p_min_support AND (c.support::NUMERIC / t.total) > 0.015
  ORDER BY lift DESC;
END;
$$;

-- ============================================================================
-- 6. CO-OCCURRENCE SCORES
-- ============================================================================
CREATE OR REPLACE FUNCTION get_cooccurrence_scores(
  p_turno TEXT DEFAULT NULL,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT,
  score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH draws AS (
    SELECT numbers FROM draws
    WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT 50
  ),
  nums AS (
    SELECT DISTINCT to_2digit(unnest(numbers)) AS n
    FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999
  ),
  pairs AS (
    SELECT LEAST(a.n, b.n) AS n1, GREATEST(a.n, b.n) AS n2, COUNT(*) AS cnt
    FROM nums a JOIN nums b ON a.n < b.n GROUP BY n1, n2
  ),
  scores AS (
    SELECT n1 AS numero, SUM(cnt)::NUMERIC / GREATEST(SUM(SUM(cnt)) OVER (), 1) AS score
    FROM pairs GROUP BY n1
    UNION ALL
    SELECT n2, SUM(cnt)::NUMERIC / GREATEST(SUM(SUM(cnt)) OVER (), 1) AS score
    FROM pairs GROUP BY n2
  )
  SELECT numero, MAX(score) AS score FROM scores GROUP BY numero ORDER BY score DESC;
END;
$$;

-- ============================================================================
-- 7. WEIGHTED ENSEMBLE
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
  WITH freq AS (SELECT * FROM get_frequency_stats(p_turno, 100, p_game_slug)),
  absence AS (SELECT * FROM get_absence_recency_cycles(p_turno, p_game_slug)),
  entropy AS (SELECT * FROM get_entropy_scores(p_turno, 50, p_game_slug)),
  survival AS (SELECT * FROM get_survival_scores(p_turno, 500, p_game_slug)),
  markov AS (
    SELECT next_number, probability, confidence
    FROM get_markov_transitions(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'], 2, 5, p_game_slug)
  ),
  cooc AS (SELECT * FROM get_cooccurrence_scores(p_turno, p_game_slug)),
  combined AS (
    SELECT
      f.numero,
      (f.freq_historica * 0.10 + f.freq_100 * 0.10 + f.freq_20 * 0.08 +
       a.recencia_exp * 0.08 + LEAST(a.ausencia_actual, 100)::NUMERIC / 100.0 * 0.06 +
       LEAST(ABS(f.freq_100 - f.freq_historica), 1) * 0.06 +
       LEAST(a.ciclo_promedio, 100)::NUMERIC / 100.0 * 0.04 +
       e.score * 0.02 + LEAST(s.hazard_rate, 1) * 0.05 +
       COALESCE(m.probability, 0) * 0.04 + COALESCE(c.score, 0) * 0.03
      ) AS final_score,
      (f.freq_historica + f.freq_100 + f.freq_20) / 3 AS freq_score,
      LEAST(a.ausencia_actual, 100)::NUMERIC / 100.0 AS absence_score,
      a.recencia_exp AS recency_score,
      LEAST(ABS(f.freq_100 - f.freq_historica), 1) AS trend_score,
      LEAST(a.ciclo_promedio, 100)::NUMERIC / 100.0 AS cycle_score,
      e.score AS entropy_score,
      LEAST(s.hazard_rate, 1) AS survival_score,
      COALESCE(m.probability, 0) AS markov_score,
      COALESCE(c.score, 0) AS cooc_score
    FROM freq f
    JOIN absence a ON f.numero = a.numero
    JOIN entropy e ON f.numero = e.numero
    LEFT JOIN survival s ON f.numero = s.numero
    LEFT JOIN markov m ON f.numero = m.next_number
    LEFT JOIN cooc c ON f.numero = c.numero
  )
  SELECT numero, final_score, freq_score, absence_score, recency_score,
    trend_score, cycle_score, entropy_score, survival_score, markov_score, cooc_score
  FROM combined ORDER BY final_score DESC;
END;
$$;

-- GRANTS
GRANT EXECUTE ON FUNCTION to_2digit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_frequency_stats TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_absence_recency_cycles TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_entropy_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_survival_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_markov_transitions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_cooccurrence_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ensemble_scores TO authenticated, anon;
