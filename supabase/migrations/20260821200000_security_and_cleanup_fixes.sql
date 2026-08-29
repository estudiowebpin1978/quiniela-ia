-- =============================================================================
-- MIGRATION: Security fixes, data cleanup, and performance
-- Date: 2026-08-21
-- =============================================================================

-- 1. FIX: backtest_omega ambiguity — qualify columns with table alias
-- The RETURN column `model_name` conflicts with the backtest_results column.
-- =============================================================================
CREATE OR REPLACE FUNCTION backtest_omega(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-05-05',
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
  -- FIX: qualify with alias "b" to resolve ambiguity with RETURN column
  DELETE FROM backtest_results b
  WHERE b.model_name = 'Omega_v6_Adaptive'
    AND b.turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno
      AND d.date >= start_date
      AND d.date <= end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws
    WHERE turno = target_turno AND date = test_date;

    IF array_length(actual_nums, 1) != 20 THEN
      CONTINUE;
    END IF;

    SELECT ARRAY(
      SELECT numero FROM calculate_omega_v5(target_turno, 'free', test_date)
      LIMIT 10
    )
    INTO predicted;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN
        hits := hits + 1;
      END IF;
    END LOOP;

    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Omega_v6_Adaptive', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits >= 3 THEN ge3 := ge3 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
    IF hits < min_h THEN min_h := hits; END IF;

    IF hits > 0 THEN
      current_streak := current_streak + 1;
      IF current_streak > best_streak_val THEN best_streak_val := current_streak; END IF;
    ELSE
      IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;
      current_streak := 0;
    END IF;
  END LOOP;

  IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;

  model_name := 'Omega_v6_Adaptive';
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


-- 2. CLEANUP: Remove user_profiles duplicates, keep most recent per email
-- =============================================================================
DO $$
DECLARE
  deleted_count INT;
BEGIN
  DELETE FROM user_profiles a
  USING user_profiles b
  WHERE a.email = b.email
    AND a.email IS NOT NULL
    AND a.email != ''
    AND a.created_at < b.created_at;

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate user_profiles rows', deleted_count;
END $$;

-- 3. CONSTRAINT: Ensure unique email in user_profiles
-- =============================================================================
DO $$
BEGIN
  -- Only add constraint if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_profiles_email_key'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT user_profiles_email_key UNIQUE (email);
    RAISE NOTICE 'Added UNIQUE constraint on user_profiles.email';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists';
  END IF;
END $$;


-- 4. CLEANUP: Drop obsolete engine_metrics table and recalculate function
-- =============================================================================
DROP TABLE IF EXISTS engine_metrics CASCADE;
DROP FUNCTION IF EXISTS recalculate_engine_metrics() CASCADE;

-- 5. CLEANUP: Delete test users from audit
-- =============================================================================
DELETE FROM user_profiles
WHERE email IN (
  'audit-test@quiniela-ia.com',
  'audit-final-test@quiniela-ia.com'
);


-- DONE
-- =============================================================================
