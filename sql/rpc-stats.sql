-- ============================================================================
-- RPC Functions for Heavy Statistical Calculations (Supabase/PostgreSQL)
-- These run in Supabase to avoid Vercel timeout/memory limits
-- Execute in Supabase SQL Editor
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
  FROM final;
END;
$$;