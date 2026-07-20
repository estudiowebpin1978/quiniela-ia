-- ============================================================
-- SECURITY FIXES: RLS for user_predictions and user_profiles
-- Execute in Supabase SQL Editor
-- ============================================================

-- === user_predictions RLS ===
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own predictions" ON user_predictions;
CREATE POLICY "Users read own predictions" ON user_predictions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own predictions" ON user_predictions;
CREATE POLICY "Users insert own predictions" ON user_predictions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own predictions" ON user_predictions;
CREATE POLICY "Users update own predictions" ON user_predictions
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own predictions" ON user_predictions;
CREATE POLICY "Users delete own predictions" ON user_predictions
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role all user_predictions" ON user_predictions;
CREATE POLICY "Service role all user_predictions" ON user_predictions
  FOR ALL USING (auth.role() = 'service_role');

-- === user_profiles RLS ===
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
CREATE POLICY "Users read own profile" ON user_profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
CREATE POLICY "Users update own profile" ON user_profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "Service role all user_profiles" ON user_profiles;
CREATE POLICY "Service role all user_profiles" ON user_profiles
  FOR ALL USING (auth.role() = 'service_role');

-- === Indexes for user_predictions ===
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date ON user_predictions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_predictions_date_turno ON user_predictions(date, turno);

-- Done
