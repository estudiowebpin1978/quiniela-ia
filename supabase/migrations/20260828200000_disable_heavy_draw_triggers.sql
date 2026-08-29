-- =====================================================================
-- FIX: Disable heavy triggers that block upsert_draw + verification
--
-- PROBLEM 1: 5 AFTER INSERT triggers on `draws` fire inside upsert_draw
--   → FK violations (orphan users in notifications), CONCURRENTLY refresh
--     inside transaction, statement timeouts → entire INSERT rolls back
--   → Draw never saved → predictions stuck "Esperando resultado"
--
-- PROBLEM 2: AFTER UPDATE trigger on `user_predictions` fires when status
--   changes to WON/LOST → inserts into notifications → FK violation
--   on orphan users → verification rolls back
--
-- Fix: disable all notification/verify/refresh triggers. These operations
-- are ALREADY handled by cron-scrape and cron-verify-predictions endpoints
-- (non-transactional, fire-and-forget).
-- =====================================================================

-- Draws table: disable all triggers except the no-op evaluate_engine_predictions
ALTER TABLE draws DISABLE TRIGGER trg_notify_draw_loaded;
ALTER TABLE draws DISABLE TRIGGER trg_verify_predictions;
ALTER TABLE draws DISABLE TRIGGER trg_refresh_predictions;
ALTER TABLE draws DISABLE TRIGGER auto_refresh_predictions_3_4;

-- user_predictions table: disable notification trigger
ALTER TABLE user_predictions DISABLE TRIGGER trg_notify_prediction_verified;

-- Clean up orphan predictions (users deleted from auth.users)
DELETE FROM user_predictions up
WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = up.user_id);

-- Clean up stale pending predictions from old dates
DELETE FROM user_predictions
WHERE date < CURRENT_DATE - INTERVAL '2 days'
  AND status = 'PENDING';
