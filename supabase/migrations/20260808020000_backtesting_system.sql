-- BACKTESTING SYSTEM: Walk-forward validation for Omega v4 Hybrid
-- For each historical draw: predict using ONLY data available BEFORE that draw
-- Then compare predictions against the actual result

-- Backtest result table
CREATE TABLE IF NOT EXISTS backtest_results (
  id SERIAL PRIMARY KEY,
  run_date TIMESTAMP DEFAULT now(),
  model_name TEXT NOT NULL,
  turno TEXT NOT NULL,
  test_date DATE NOT NULL,
  predicted_numbers INT[] NOT NULL,
  actual_numbers INT[] NOT NULL,
  hits_top10 INT DEFAULT 0,
  hits_top5 INT DEFAULT 0,
  hits_top3 INT DEFAULT 0,
  hits_top1 INT DEFAULT 0,
  hit_rate NUMERIC DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_backtest_model ON backtest_results(model_name, turno);
CREATE INDEX IF NOT EXISTS idx_backtest_date ON backtest_results(test_date);

-- Main backtest function: Omega v4 Hybrid
CREATE OR REPLACE FUNCTION backtest_omega(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-06-01',
  end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  model_name TEXT,
  turno TEXT,
  total_tests INT,
  avg_hits NUMERIC,
  max_hits INT,
  min_hits INT,
  pct_ge1 NUMERIC,
  pct_ge2 NUMERIC,
  pct_ge3 NUMERIC,
  worst_streak INT,
  best_streak INT,
  hit_rate_top10 NUMERIC,
  hit_rate_top5 NUMERIC,
  hit_rate_top3 NUMERIC,
  hit_rate_top1 NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date DATE;
  actual_nums INT[];
  predicted INT[];
  hits INT;
  current_streak INT := 0;
  worst_streak_val INT := 0;
  best_streak_val INT := 0;
  total_hits INT := 0;
  total_tests_count INT := 0;
  ge1 INT := 0;
  ge2 INT := 0;
  ge3 INT := 0;
  max_h INT := 0;
  min_h INT := 999;
BEGIN
  -- Clean previous run for this turno
  DELETE FROM backtest_results WHERE model_name = 'Omega_v4_Hybrid' AND turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno
      AND d.date >= start_date
      AND d.date <= end_date
    ORDER BY d.date
  LOOP
    -- Get actual numbers for this date
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws
    WHERE turno = target_turno AND date = test_date;

    -- Skip if not exactly 20 numbers
    IF array_length(actual_nums, 1) != 20 THEN
      CONTINUE;
    END IF;

    -- Get Omega predictions (only uses data BEFORE test_date)
    SELECT ARRAY(
      SELECT numero FROM calculate_omega_hybrid(target_turno, 'free', test_date)
      LIMIT 10
    )
    INTO predicted;

    -- Count hits
    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN
        hits := hits + 1;
      END IF;
    END LOOP;

    -- Record result
    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Omega_v4_Hybrid', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    -- Accumulate stats
    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits >= 3 THEN ge3 := ge3 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
    IF hits < min_h THEN min_h := hits; END IF;

    -- Streak tracking
    IF hits > 0 THEN
      current_streak := current_streak + 1;
      IF current_streak > best_streak_val THEN best_streak_val := current_streak; END IF;
    ELSE
      IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;
      current_streak := 0;
    END IF;
  END LOOP;

  -- Handle case where current streak is the worst
  IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;

  -- Return summary
  model_name := 'Omega_v4_Hybrid';
  turno := target_turno;
  total_tests := total_tests_count;
  avg_hits := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / total_tests_count ELSE 0 END;
  max_hits := max_h;
  min_hits := CASE WHEN min_h = 999 THEN 0 ELSE min_h END;
  pct_ge1 := CASE WHEN total_tests_count > 0 THEN ge1::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge2 := CASE WHEN total_tests_count > 0 THEN ge2::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge3 := CASE WHEN total_tests_count > 0 THEN ge3::NUMERIC / total_tests_count * 100 ELSE 0 END;
  worst_streak := worst_streak_val;
  best_streak := best_streak_val;
  hit_rate_top10 := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / (total_tests_count * 10) * 100 ELSE 0 END;
  hit_rate_top5 := 0;
  hit_rate_top3 := 0;
  hit_rate_top1 := 0;
  RETURN NEXT;
END;
$$;

-- Baseline A: Random selection (10 random numbers 0-99)
CREATE OR REPLACE FUNCTION backtest_random(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-06-01',
  end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  model_name TEXT,
  turno TEXT,
  total_tests INT,
  avg_hits NUMERIC,
  max_hits INT,
  pct_ge1 NUMERIC,
  pct_ge2 NUMERIC,
  hit_rate_top10 NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date DATE;
  actual_nums INT[];
  predicted INT[];
  hits INT;
  total_hits INT := 0;
  total_tests_count INT := 0;
  ge1 INT := 0;
  ge2 INT := 0;
  max_h INT := 0;
BEGIN
  DELETE FROM backtest_results WHERE model_name = 'Random' AND turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno AND d.date >= start_date AND d.date <= end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws WHERE turno = target_turno AND date = test_date;

    IF array_length(actual_nums, 1) != 20 THEN CONTINUE; END IF;

    -- Generate 10 random numbers 0-99
    SELECT ARRAY(SELECT DISTINCT num FROM generate_series(0, 99) num ORDER BY random() LIMIT 10)
    INTO predicted;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN hits := hits + 1; END IF;
    END LOOP;

    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Random', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
  END LOOP;

  model_name := 'Random';
  turno := target_turno;
  total_tests := total_tests_count;
  avg_hits := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / total_tests_count ELSE 0 END;
  max_hits := max_h;
  pct_ge1 := CASE WHEN total_tests_count > 0 THEN ge1::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge2 := CASE WHEN total_tests_count > 0 THEN ge2::NUMERIC / total_tests_count * 100 ELSE 0 END;
  hit_rate_top10 := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / (total_tests_count * 10) * 100 ELSE 0 END;
  RETURN NEXT;
END;
$$;

-- Baseline B: Top 10 most frequent numbers (all-time frequency)
CREATE OR REPLACE FUNCTION backtest_frequency(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-06-01',
  end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  model_name TEXT,
  turno TEXT,
  total_tests INT,
  avg_hits NUMERIC,
  max_hits INT,
  pct_ge1 NUMERIC,
  pct_ge2 NUMERIC,
  hit_rate_top10 NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date DATE;
  actual_nums INT[];
  predicted INT[];
  hits INT;
  total_hits INT := 0;
  total_tests_count INT := 0;
  ge1 INT := 0;
  ge2 INT := 0;
  max_h INT := 0;
BEGIN
  DELETE FROM backtest_results WHERE model_name = 'Frequency' AND turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno AND d.date >= start_date AND d.date <= end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws WHERE turno = target_turno AND date = test_date;

    IF array_length(actual_nums, 1) != 20 THEN CONTINUE; END IF;

    -- Top 10 most frequent numbers in draws BEFORE this date
    SELECT ARRAY(
      SELECT MOD(unnest(numbers), 100) AS num
      FROM draws
      WHERE turno = target_turno AND date < test_date
      GROUP BY num ORDER BY COUNT(*) DESC LIMIT 10
    )
    INTO predicted;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN hits := hits + 1; END IF;
    END LOOP;

    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Frequency', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
  END LOOP;

  model_name := 'Frequency';
  turno := target_turno;
  total_tests := total_tests_count;
  avg_hits := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / total_tests_count ELSE 0 END;
  max_hits := max_h;
  pct_ge1 := CASE WHEN total_tests_count > 0 THEN ge1::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge2 := CASE WHEN total_tests_count > 0 THEN ge2::NUMERIC / total_tests_count * 100 ELSE 0 END;
  hit_rate_top10 := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / (total_tests_count * 10) * 100 ELSE 0 END;
  RETURN NEXT;
END;
$$;

-- Baseline C: Most overdue numbers (longest since last appearance)
CREATE OR REPLACE FUNCTION backtest_overdue(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-06-01',
  end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  model_name TEXT,
  turno TEXT,
  total_tests INT,
  avg_hits NUMERIC,
  max_hits INT,
  pct_ge1 NUMERIC,
  pct_ge2 NUMERIC,
  hit_rate_top10 NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date DATE;
  actual_nums INT[];
  predicted INT[];
  hits INT;
  total_hits INT := 0;
  total_tests_count INT := 0;
  ge1 INT := 0;
  ge2 INT := 0;
  max_h INT := 0;
BEGIN
  DELETE FROM backtest_results WHERE model_name = 'Overdue' AND turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno AND d.date >= start_date AND d.date <= end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws WHERE turno = target_turno AND date = test_date;

    IF array_length(actual_nums, 1) != 20 THEN CONTINUE; END IF;

    -- Top 10 most overdue numbers (not seen for longest)
    SELECT ARRAY(
      SELECT num FROM (
        SELECT MOD(unnest(numbers), 100) AS num,
          MIN(ROW_NUMBER() OVER (ORDER BY date DESC)) AS last_seen
        FROM draws
        WHERE turno = target_turno AND date < test_date
        GROUP BY num
      ) sub
      ORDER BY last_seen DESC NULLS FIRST
      LIMIT 10
    )
    INTO predicted;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN hits := hits + 1; END IF;
    END LOOP;

    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Overdue', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
  END LOOP;

  model_name := 'Overdue';
  turno := target_turno;
  total_tests := total_tests_count;
  avg_hits := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / total_tests_count ELSE 0 END;
  max_hits := max_h;
  pct_ge1 := CASE WHEN total_tests_count > 0 THEN ge1::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge2 := CASE WHEN total_tests_count > 0 THEN ge2::NUMERIC / total_tests_count * 100 ELSE 0 END;
  hit_rate_top10 := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / (total_tests_count * 10) * 100 ELSE 0 END;
  RETURN NEXT;
END;
$$;
