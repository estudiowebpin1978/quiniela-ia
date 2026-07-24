-- ============================================================================
-- 05-rpc-backtest.sql: Backtesting and verification RPCs
-- Ejecutar DESPUÉS de 04-rpc-analytics.sql
-- ============================================================================

-- ============================================================================
-- 1. VERIFY PREDICTIONS (matches actuals against predictions)
-- ============================================================================
CREATE OR REPLACE FUNCTION verify_predictions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_verified INT;
BEGIN
  INSERT INTO prediction_history (
    prediction_id, user_id, game_id, date, turno,
    predicted_2c, predicted_3c, predicted_4c,
    actual_2c, actual_3c, actual_4c,
    hit_2c, hit_3c, hit_4c, verified_at
  )
  SELECT
    up.id,
    up.user_id,
    up.game_id,
    up.date,
    up.turno,
    up.numbers_2c,
    up.numbers_3c,
    up.numbers_4c,
    d.numbers[1] % 100,
    d.numbers[1] % 1000,
    d.numbers[1],
    CASE WHEN d.numbers[1] % 100 = ANY(up.numbers_2c) THEN TRUE ELSE FALSE END,
    CASE WHEN d.numbers[1] % 1000 = ANY(up.numbers_3c) THEN TRUE ELSE FALSE END,
    CASE WHEN d.numbers[1] = ANY(up.numbers_4c) THEN TRUE ELSE FALSE END,
    NOW()
  FROM user_predictions up
  JOIN draws d ON d.game_id = up.game_id AND d.date = up.date AND d.turno = up.turno
  LEFT JOIN prediction_history ph ON ph.prediction_id = up.id
  WHERE ph.prediction_id IS NULL
    AND d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) > 0;

  GET DIAGNOSTICS v_verified = ROW_COUNT;
  RETURN v_verified;
END;
$$;

-- ============================================================================
-- 2. COMPUTE BACKTEST (single turno)
-- ============================================================================
CREATE OR REPLACE FUNCTION compute_backtest(
  p_turno TEXT,
  p_game_slug TEXT DEFAULT 'quiniela',
  p_window INT DEFAULT 100
) RETURNS TABLE(
  test_date DATE,
  rank_2c INT,
  hit_top1 BOOLEAN,
  hit_top5 BOOLEAN,
  hit_top10 BOOLEAN,
  score NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers
    FROM draws
    WHERE game_id = v_game_id
      AND turno = p_turno
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
    LIMIT p_window
  ),
  test_draws AS (
    SELECT date, numbers, ROW_NUMBER() OVER (ORDER BY date) AS rn
    FROM draws
  ),
  results AS (
    SELECT
      td.date AS test_date,
      td.numbers[1] % 100 AS actual_2c,
      es.numero,
      es.final_score,
      RANK() OVER (PARTITION BY td.date ORDER BY es.final_score DESC) AS rank
    FROM test_draws td
    CROSS JOIN LATERAL get_ensemble_scores(p_turno, p_game_slug) es
    WHERE td.rn > 10
  )
  SELECT
    r.test_date,
    r.rank::INT AS rank_2c,
    (r.rank = 1) AS hit_top1,
    (r.rank <= 5) AS hit_top5,
    (r.rank <= 10) AS hit_top10,
    r.final_score
  FROM results r
  WHERE r.rank <= 10
    AND r.numero = r.actual_2c
  ORDER BY r.test_date DESC;
END;
$$;

-- ============================================================================
-- 3. RUN DAILY BACKTEST (cron job)
-- ============================================================================
CREATE OR REPLACE FUNCTION run_daily_backtest(p_game_slug TEXT DEFAULT 'quiniela')
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_turno TEXT;
  v_inserted INT := 0;
  v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN 0; END IF;

  FOR v_turno IN SELECT DISTINCT turno FROM draws WHERE game_id = v_game_id
  LOOP
    INSERT INTO backtest_results (
      game_id, turno, model_type, test_date,
      train_window_start, train_window_end,
      hit_at_1_2c, hit_at_5_2c, hit_at_10_2c,
      rank_2c, score_2c, roi_2c
    )
    SELECT
      v_game_id,
      v_turno,
      'ensemble',
      d.date,
      d.date - INTERVAL '365 days',
      d.date - INTERVAL '1 day',
      CASE WHEN d.numbers[1] % 100 = es.numero THEN TRUE ELSE FALSE END,
      EXISTS (
        SELECT 1 FROM get_ensemble_scores(v_turno, p_game_slug) sub
        WHERE sub.numero = d.numbers[1] % 100
        ORDER BY sub.final_score DESC LIMIT 5
      ),
      EXISTS (
        SELECT 1 FROM get_ensemble_scores(v_turno, p_game_slug) sub
        WHERE sub.numero = d.numbers[1] % 100
        ORDER BY sub.final_score DESC LIMIT 10
      ),
      (SELECT RANK() OVER (ORDER BY sub.final_score DESC)
       FROM get_ensemble_scores(v_turno, p_game_slug) sub
       WHERE sub.numero = d.numbers[1] % 100
       LIMIT 1)::INT,
      es.final_score,
      CASE WHEN d.numbers[1] % 100 = es.numero THEN 60 ELSE -10 END
    FROM draws d
    JOIN LATERAL get_ensemble_scores(v_turno, p_game_slug) es ON TRUE
    WHERE d.game_id = v_game_id
      AND d.turno = v_turno
      AND d.date = CURRENT_DATE - INTERVAL '1 day'
      AND NOT EXISTS (
        SELECT 1 FROM backtest_results br
        WHERE br.game_id = v_game_id
          AND br.turno = v_turno
          AND br.test_date = d.date
          AND br.model_type = 'ensemble'
      )
    LIMIT 1;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END LOOP;

  RETURN v_inserted;
END;
$$;

-- ============================================================================
-- 4. BACKTEST SUMMARY VIEW
-- ============================================================================
CREATE OR REPLACE VIEW backtest_summary AS
SELECT
  game_id,
  turno,
  model_type,
  COUNT(*) AS total_tests,
  SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END) AS hits_top1,
  SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END) AS hits_top5,
  SUM(CASE WHEN hit_at_10_2c THEN 1 ELSE 0 END) AS hits_top10,
  ROUND(SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 2) AS accuracy_top1_pct,
  ROUND(SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 2) AS accuracy_top5_pct,
  ROUND(AVG(score_2c), 4) AS avg_score,
  SUM(roi_2c) AS total_roi,
  MIN(test_date) AS first_test,
  MAX(test_date) AS last_test
FROM backtest_results
GROUP BY game_id, turno, model_type;

-- ============================================================================
-- 5. GET MOTOR ACCURACY (for weight optimization)
-- ============================================================================
CREATE OR REPLACE FUNCTION get_motor_accuracy(
  p_motor TEXT,
  p_turno TEXT,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_accuracy NUMERIC;
BEGIN
  SELECT COALESCE(
    SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1),
    0
  ) INTO v_accuracy
  FROM motor_performance mp
  WHERE mp.motor = p_motor
    AND mp.turno = p_turno
    AND mp.game_id = (SELECT id FROM games WHERE slug = p_game_slug);

  RETURN v_accuracy;
END;
$$;

-- ============================================================================
-- 6. UPDATE MOTOR PERFORMANCE (after each prediction)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_motor_performance(
  p_motor TEXT,
  p_turno TEXT,
  p_game_slug TEXT,
  p_accuracy NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;

  INSERT INTO motor_performance (game_id, motor, turno, accuracy, times_used, last_used)
  VALUES (v_game_id, p_motor, p_turno, p_accuracy, 1, NOW())
  ON CONFLICT (game_id, motor, turno)
  DO UPDATE SET
    accuracy = (motor_performance.accuracy * motor_performance.times_used + p_accuracy) / (motor_performance.times_used + 1),
    times_used = motor_performance.times_used + 1,
    last_used = NOW(),
    updated_at = NOW();
END;
$$;

-- ============================================================================
-- 7. CLEAN OLD MOTOR PERFORMANCE
-- ============================================================================
CREATE OR REPLACE FUNCTION clear_old_motor_performance(p_days INT DEFAULT 90)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM motor_performance
  WHERE updated_at < NOW() - (p_days || ' days')::INTERVAL
    AND times_used < 5;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION verify_predictions TO service_role;
GRANT EXECUTE ON FUNCTION compute_backtest TO service_role;
GRANT EXECUTE ON FUNCTION run_daily_backtest TO service_role;
GRANT EXECUTE ON FUNCTION get_motor_accuracy TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_motor_performance TO service_role;
GRANT EXECUTE ON FUNCTION clear_old_motor_performance TO service_role;
GRANT SELECT ON backtest_summary TO authenticated;
