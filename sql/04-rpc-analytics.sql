-- ============================================================================
-- 04-rpc-analytics.sql: Analytics pre-calculation RPCs
-- Ejecutar DESPUÉS de 03-rpc-ensemble.sql
-- ============================================================================

-- ============================================================================
-- 1. COMPUTE INTER-TURNO MARKOV
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_inter_turno_markov(
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN '{}'::JSONB; END IF;

  WITH draws AS (
    SELECT date, turno, to_2digit(numbers[1]) AS first_num
    FROM draws
    WHERE game_id = v_game_id
      AND array_length(numbers, 1) >= 20
  ),
  pivoted AS (
    SELECT
      date,
      MAX(CASE WHEN turno = 'Previa' THEN first_num END) AS previa,
      MAX(CASE WHEN turno = 'Primera' THEN first_num END) AS primera,
      MAX(CASE WHEN turno = 'Matutina' THEN first_num END) AS matutina,
      MAX(CASE WHEN turno = 'Vespertina' THEN first_num END) AS vespertina,
      MAX(CASE WHEN turno = 'Nocturna' THEN first_num END) AS nocturna
    FROM draws
    GROUP BY date
    HAVING COUNT(DISTINCT turno) >= 3
  ),
  transitions AS (
    SELECT
      previa AS from_previa,
      primera AS to_primera,
      LAG(primera) OVER (ORDER BY date) AS prev_primera
    FROM pivoted
  )
  SELECT jsonb_build_object(
    'transitions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
        'from', from_previa,
        'to', to_primera,
        'count', 1
      )) FROM transitions WHERE from_previa IS NOT NULL),
      '[]'::JSONB
    ),
    'order', 2,
    'computed_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 2. COMPUTE SHANNON ENTROPY (for turn_analytics)
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_shannon_entropy(
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_entropy NUMERIC;
  v_trend TEXT;
  v_result JSONB;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN '{}'::JSONB; END IF;

  WITH draws AS (
    SELECT numbers FROM draws
    WHERE game_id = v_game_id
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT 50
  ),
  freq AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
    GROUP BY n
  ),
  total AS (
    SELECT SUM(cnt) AS tot FROM freq
  ),
  probs AS (
    SELECT cnt / GREATEST(tot, 1) AS p
    FROM freq CROSS JOIN total
  ),
  entropy_calc AS (
    SELECT COALESCE(-SUM(p * LOG(2, p)), LOG(2, 100)) AS raw_entropy
    FROM probs WHERE p > 0
  )
  SELECT
    raw_entropy / LOG(2, 100),
    'stable'
  INTO v_entropy, v_trend
  FROM entropy_calc;

  v_result := jsonb_build_object(
    'entropy_value', COALESCE(v_entropy, 0.99),
    'entropy_trend', COALESCE(v_trend, 'stable'),
    'entropy_alert', COALESCE(v_entropy, 0.99) < 0.85,
    'computed_at', NOW()
  );

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 3. COMPUTE SURVIVAL HAZARD (for turn_analytics)
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_survival_hazard(
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN '{}'::JSONB; END IF;

  WITH draws AS (
    SELECT date, numbers,
           ROW_NUMBER() OVER (ORDER BY date DESC) - 1 AS idx
    FROM draws
    WHERE game_id = v_game_id
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT 500
  ),
  appearances AS (
    SELECT to_2digit(unnest(numbers)) AS n, idx
    FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999
  ),
  gaps AS (
    SELECT n, LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC) - idx AS gap
    FROM appearances
  ),
  gap_stats AS (
    SELECT n, AVG(gap)::NUMERIC AS mean_gap, STDDEV(gap)::NUMERIC AS gap_std
    FROM gaps WHERE gap > 0 GROUP BY n HAVING AVG(gap) > 0
  ),
  critical AS (
    SELECT jsonb_agg(n) AS critical_numbers
    FROM gap_stats
    WHERE mean_gap > 0 AND (mean_gap - COALESCE(gap_std, 0)) > 5
  )
  SELECT jsonb_build_object(
    'overall_hazard', COALESCE((SELECT 1.0 / AVG(mean_gap) FROM gap_stats), 0),
    'critical_numbers', COALESCE((SELECT critical_numbers FROM critical), '[]'::JSONB),
    'computed_at', NOW()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================================
-- 4. GET LATEST ANALYTICS (for predictions)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_latest_analytics(
  p_turno TEXT,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_result JSONB;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN '{}'::JSONB; END IF;

  SELECT jsonb_build_object(
    'entropy', jsonb_build_object(
      'value', entropy_value,
      'trend', entropy_trend,
      'alert', entropy_alert
    ),
    'survival', survival_hazard,
    'markov', markov_transitions,
    'genetic_weights', genetic_weights,
    'composite_confidence', composite_confidence,
    'fecha', fecha,
    'computed_at', fecha_calculo
  )
  INTO v_result
  FROM turn_analytics
  WHERE game_id = v_game_id
    AND turno = p_turno
  ORDER BY fecha DESC
  LIMIT 1;

  RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;

-- ============================================================================
-- 5. UPSERT TURN ANALYTICS (daily cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION upsert_turn_analytics(
  p_turno TEXT,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_today DATE := CURRENT_DATE;
  v_entropy JSONB;
  v_survival JSONB;
  v_markov JSONB;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  v_entropy := compute_shannon_entropy(p_game_slug);
  v_survival := compute_survival_hazard(p_game_slug);
  v_markov := jsonb_build_object('transitions', '[]'::JSONB, 'order', 2);

  INSERT INTO turn_analytics (
    game_id, turno, fecha,
    entropy_value, entropy_trend, entropy_alert,
    survival_hazard, survival_critical,
    markov_transitions, markov_order,
    composite_confidence
  ) VALUES (
    v_game_id, p_turno, v_today,
    (v_entropy->>'entropy_value')::NUMERIC,
    v_entropy->>'entropy_trend',
    (v_entropy->>'entropy_alert')::BOOLEAN,
    v_survival,
    v_survival->'critical_numbers',
    v_markov,
    2,
    0.5
  )
  ON CONFLICT (game_id, turno, fecha)
  DO UPDATE SET
    entropy_value = EXCLUDED.entropy_value,
    entropy_trend = EXCLUDED.entropy_trend,
    entropy_alert = EXCLUDED.entropy_alert,
    survival_hazard = EXCLUDED.survival_hazard,
    survival_critical = EXCLUDED.survival_critical,
    markov_transitions = EXCLUDED.markov_transitions,
    fecha_calculo = NOW();
END;
$$;

-- ============================================================================
-- 6. COMPUTE ALL TURNOS ANALYTICS (batch)
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_all_turn_analytics(
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno TEXT;
BEGIN
  FOR v_turno IN SELECT DISTINCT turno FROM draws
    WHERE game_id = (SELECT id FROM games WHERE slug = p_game_slug)
  LOOP
    PERFORM upsert_turn_analytics(v_turno, p_game_slug);
  END LOOP;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION compute_inter_turno_markov TO service_role;
GRANT EXECUTE ON FUNCTION compute_shannon_entropy TO service_role;
GRANT EXECUTE ON FUNCTION compute_survival_hazard TO service_role;
GRANT EXECUTE ON FUNCTION get_latest_analytics TO authenticated, anon;
GRANT EXECUTE ON FUNCTION upsert_turn_analytics TO service_role;
GRANT EXECUTE ON FUNCTION compute_all_turn_analytics TO service_role;
