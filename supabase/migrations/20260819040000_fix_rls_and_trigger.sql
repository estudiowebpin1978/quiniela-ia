-- =============================================================================
-- FIX: Remove broken check_predictions_allowed trigger + fix RLS
-- =============================================================================

-- 1. Drop the broken trigger (jsonb_object_keys syntax error)
DROP TRIGGER IF EXISTS trg_check_predictions_allowed ON user_predictions;

-- 2. Drop the broken function
DROP FUNCTION IF EXISTS check_predictions_allowed() CASCADE;

-- 3. Fix RLS: service_role INSERT was blocked because auth.uid() is null for service_role
-- The policy "users_insert_own_predictions" checks auth.uid() = user_id
-- but service_role has auth.uid() = NULL, so it fails.
-- Fix: allow service_role to insert too.

DROP POLICY IF EXISTS "users_insert_own_predictions" ON user_predictions;
CREATE POLICY "users_insert_own_predictions"
  ON user_predictions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS "users_update_own_predictions" ON user_predictions;
CREATE POLICY "users_update_own_predictions"
  ON user_predictions FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

-- 4. Same fix for prediction_history
DROP POLICY IF EXISTS "service_role_all_history" ON prediction_history;
CREATE POLICY "service_role_insert_history"
  ON prediction_history FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() = user_id);

-- 5. Same fix for user_stats
DROP POLICY IF EXISTS "service_role_all_stats" ON user_stats;
CREATE POLICY "service_all_stats"
  ON user_stats FOR ALL
  USING (auth.role() = 'service_role' OR auth.uid() = user_id);
