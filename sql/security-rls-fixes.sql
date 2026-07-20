-- ============================================================
-- SECURITY FIXES: RLS for user_predictions and user_profiles
-- Execute in Supabase SQL Editor
-- ============================================================

-- === user_predictions RLS ===
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own predictions
DROP POLICY IF EXISTS "Users read own predictions" ON user_predictions;
CREATE POLICY "Users read own predictions" ON user_predictions
  FOR SELECT USING (auth.uid() = user_id);

-- Users can insert their own predictions
DROP POLICY IF EXISTS "Users insert own predictions" ON user_predictions;
CREATE POLICY "Users insert own predictions" ON user_predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own predictions
DROP POLICY IF EXISTS "Users update own predictions" ON user_predictions;
CREATE POLICY "Users update own predictions" ON user_predictions
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can delete their own predictions
DROP POLICY IF EXISTS "Users delete own predictions" ON user_predictions;
CREATE POLICY "Users delete own predictions" ON user_predictions
  FOR DELETE USING (auth.uid() = user_id);

-- Service role bypass (for cron, admin, verification)
DROP POLICY IF EXISTS "Service role all user_predictions" ON user_predictions;
CREATE POLICY "Service role all user_predictions" ON user_predictions
  FOR ALL USING (auth.role() = 'service_role');

-- === user_profiles RLS ===
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile (limited columns via trigger if needed)
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

-- Service role bypass
DROP POLICY IF EXISTS "Service role all user_profiles" ON user_profiles;
CREATE POLICY "Service role all user_profiles" ON user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- === Indexes for user_predictions ===
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date ON user_predictions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_predictions_date_turno ON user_predictions(date, turno);

-- === Fix: Add SET search_path to SECURITY DEFINER functions ===
-- These only work if the functions already exist (run setup-motor-performance.sql first)

DO $$ BEGIN
  ALTER FUNCTION update_motor_performance(TEXT, TEXT, NUMERIC) 
    SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION get_top_motors(TEXT, INTEGER) 
    SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION get_skipped_motors(TEXT) 
    SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION should_run_motor(TEXT, TEXT) 
    SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

DO $$ BEGIN
  ALTER FUNCTION clear_old_motor_performance(INTEGER) 
    SET search_path = public, pg_temp;
EXCEPTION WHEN undefined_function THEN NULL;
END $$;

-- Done
