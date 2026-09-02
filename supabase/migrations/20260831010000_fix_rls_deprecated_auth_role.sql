-- Fix deprecated auth.role() -> auth.jwt()->>'role' in all RLS policies
-- auth.role() may be removed in future Supabase updates

-- ═══════════════════════════════════════════════════════════════
-- user_profiles
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all" ON user_profiles;
CREATE POLICY "service_role_all" ON user_profiles FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- user_predictions
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "users_read_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "users_insert_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "users_update_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "service_role_all_predictions" ON user_predictions;

CREATE POLICY "users_read_own_predictions" ON user_predictions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_insert_own_predictions" ON user_predictions FOR INSERT WITH CHECK (auth.uid() = user_id OR auth.jwt()->>'role' = 'service_role');
CREATE POLICY "users_update_own_predictions" ON user_predictions FOR UPDATE USING (auth.uid() = user_id OR auth.jwt()->>'role' = 'service_role');
CREATE POLICY "service_role_all_predictions" ON user_predictions FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- prediction_history
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "users_read_own_history" ON prediction_history;
DROP POLICY IF EXISTS "service_role_all_history" ON prediction_history;

CREATE POLICY "users_read_own_history" ON prediction_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_role_all_history" ON prediction_history FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- user_stats
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "users_read_own_stats" ON user_stats;
DROP POLICY IF EXISTS "service_role_all_stats" ON user_stats;

CREATE POLICY "users_read_own_stats" ON user_stats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "service_role_all_stats" ON user_stats FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- engine_config
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_engine_config" ON engine_config;
CREATE POLICY "service_role_engine_config" ON engine_config FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- engine_predictions
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_engine_predictions" ON engine_predictions;
CREATE POLICY "service_role_engine_predictions" ON engine_predictions FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- prediction_results
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_prediction_results" ON prediction_results;
CREATE POLICY "service_role_prediction_results" ON prediction_results FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- engine_metrics
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_engine_metrics" ON engine_metrics;
CREATE POLICY "service_role_engine_metrics" ON engine_metrics FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- model_weights
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_model_weights" ON model_weights;
CREATE POLICY "service_role_model_weights" ON model_weights FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- scrape_runs
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_scrape_runs" ON scrape_runs;
CREATE POLICY "service_role_scrape_runs" ON scrape_runs FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- draw_sources
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_draw_sources" ON draw_sources;
CREATE POLICY "service_role_draw_sources" ON draw_sources FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- webhook_logs
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_webhook_logs" ON webhook_logs;
CREATE POLICY "service_role_all_webhook_logs" ON webhook_logs FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- cached_predictions_3cifras
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_cp3" ON cached_predictions_3cifras;
CREATE POLICY "service_role_all_cp3" ON cached_predictions_3cifras FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- cached_predictions_4cifras
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_cp4" ON cached_predictions_4cifras;
CREATE POLICY "service_role_all_cp4" ON cached_predictions_4cifras FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- push_subscriptions
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_push_subscriptions" ON push_subscriptions;
CREATE POLICY "service_role_all_push_subscriptions" ON push_subscriptions FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- notifications
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_notifications" ON notifications;
CREATE POLICY "service_role_all_notifications" ON notifications FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- cron_logs
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_cron_logs" ON cron_logs;
CREATE POLICY "service_role_all_cron_logs" ON cron_logs FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- ═══════════════════════════════════════════════════════════════
-- predictions_cache
-- ═══════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "service_role_all_predictions_cache" ON predictions_cache;
CREATE POLICY "service_role_all_predictions_cache" ON predictions_cache FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
