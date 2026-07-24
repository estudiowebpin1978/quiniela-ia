-- ============================================================================
-- 06-rls-policies.sql: RLS policies (fully idempotent)
-- ============================================================================

-- ============================================================================
-- 1. GAMES (public read)
-- ============================================================================
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_games" ON games;
CREATE POLICY "public_read_games" ON games FOR SELECT USING (true);

-- ============================================================================
-- 2. DRAWS (public read, service write)
-- ============================================================================
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_draws" ON draws;
DROP POLICY IF EXISTS "service_write_draws" ON draws;
DROP POLICY IF EXISTS "service_update_draws" ON draws;
CREATE POLICY "public_read_draws" ON draws FOR SELECT USING (true);
CREATE POLICY "service_write_draws" ON draws FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_draws" ON draws FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================================
-- 3. USER_PROFILES
-- ============================================================================
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_read_profile" ON user_profiles;
DROP POLICY IF EXISTS "owner_update_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_write_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_delete_profile" ON user_profiles;
CREATE POLICY "owner_read_profile" ON user_profiles FOR SELECT USING (auth.uid() = id OR auth.role() = 'service_role');
CREATE POLICY "owner_update_profile" ON user_profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "service_write_profile" ON user_profiles FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_delete_profile" ON user_profiles FOR DELETE USING (auth.role() = 'service_role');

-- ============================================================================
-- 4. USER_PREDICTIONS
-- ============================================================================
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_read_predictions" ON user_predictions;
DROP POLICY IF EXISTS "owner_insert_predictions" ON user_predictions;
DROP POLICY IF EXISTS "owner_delete_predictions" ON user_predictions;
DROP POLICY IF EXISTS "service_write_predictions" ON user_predictions;
DROP POLICY IF EXISTS "service_delete_predictions" ON user_predictions;
CREATE POLICY "owner_read_predictions" ON user_predictions FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');
CREATE POLICY "owner_insert_predictions" ON user_predictions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner_delete_predictions" ON user_predictions FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "service_write_predictions" ON user_predictions FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_delete_predictions" ON user_predictions FOR DELETE USING (auth.role() = 'service_role');

-- ============================================================================
-- 5. PREDICTION_HISTORY
-- ============================================================================
ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "owner_read_history" ON prediction_history;
DROP POLICY IF EXISTS "service_write_history" ON prediction_history;
CREATE POLICY "owner_read_history" ON prediction_history FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');
CREATE POLICY "service_write_history" ON prediction_history FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 6. TURN_ANALYTICS
-- ============================================================================
ALTER TABLE turn_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_analytics" ON turn_analytics;
DROP POLICY IF EXISTS "service_write_analytics" ON turn_analytics;
DROP POLICY IF EXISTS "service_update_analytics" ON turn_analytics;
CREATE POLICY "authenticated_read_analytics" ON turn_analytics FOR SELECT USING (true);
CREATE POLICY "service_write_analytics" ON turn_analytics FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_analytics" ON turn_analytics FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================================
-- 7. BACKTEST_RESULTS
-- ============================================================================
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_backtest" ON backtest_results;
DROP POLICY IF EXISTS "service_write_backtest" ON backtest_results;
CREATE POLICY "authenticated_read_backtest" ON backtest_results FOR SELECT USING (true);
CREATE POLICY "service_write_backtest" ON backtest_results FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- ============================================================================
-- 8. ML_MODELS
-- ============================================================================
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_ml" ON ml_models;
DROP POLICY IF EXISTS "service_write_ml" ON ml_models;
DROP POLICY IF EXISTS "service_update_ml" ON ml_models;
CREATE POLICY "authenticated_read_ml" ON ml_models FOR SELECT USING (true);
CREATE POLICY "service_write_ml" ON ml_models FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_ml" ON ml_models FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================================
-- 9. ML_DL_MODELS
-- ============================================================================
ALTER TABLE ml_dl_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_dl" ON ml_dl_models;
DROP POLICY IF EXISTS "service_write_dl" ON ml_dl_models;
DROP POLICY IF EXISTS "service_update_dl" ON ml_dl_models;
CREATE POLICY "authenticated_read_dl" ON ml_dl_models FOR SELECT USING (true);
CREATE POLICY "service_write_dl" ON ml_dl_models FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_dl" ON ml_dl_models FOR UPDATE USING (auth.role() = 'service_role');

-- ============================================================================
-- 10. MOTOR_PERFORMANCE
-- ============================================================================
ALTER TABLE motor_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "authenticated_read_motor" ON motor_performance;
DROP POLICY IF EXISTS "service_write_motor" ON motor_performance;
DROP POLICY IF EXISTS "service_update_motor" ON motor_performance;
CREATE POLICY "authenticated_read_motor" ON motor_performance FOR SELECT USING (true);
CREATE POLICY "service_write_motor" ON motor_performance FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "service_update_motor" ON motor_performance FOR UPDATE USING (auth.role() = 'service_role');
