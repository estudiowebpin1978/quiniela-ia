-- ============================================================
-- MIGRATION: RLS Security Fixes
-- Date: 2026-08-04
-- Description: Fixes critical RLS vulnerabilities:
--   1. cached_predictions — add RLS + policies (was completely open)
--   2. verification_queue — add RLS + policies (was completely open)
--   3. rate_limits — add RLS + policies (was completely open)
--   4. ml_models / ml_dl_models — restrict public SELECT to authenticated only
--   5. user_gamification / user_achievements — add user read policies
-- ============================================================

-- ── 1. cached_predictions: Add RLS ─────────────────────────
ALTER TABLE cached_predictions ENABLE ROW LEVEL SECURITY;

-- Public read (predictions are not secret — same for all users)
CREATE POLICY "Public read cached_predictions"
  ON cached_predictions FOR SELECT
  USING (true);

-- Service role write (only triggers/cron should write)
CREATE POLICY "Service insert cached_predictions"
  ON cached_predictions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service update cached_predictions"
  ON cached_predictions FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service delete cached_predictions"
  ON cached_predictions FOR DELETE
  USING (auth.role() = 'service_role');

-- ── 2. verification_queue: Add RLS ─────────────────────────
ALTER TABLE verification_queue ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (internal job queue)
CREATE POLICY "Service all verification_queue"
  ON verification_queue FOR ALL
  USING (auth.role() = 'service_role');

-- ── 3. rate_limits: Add RLS ────────────────────────────────
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (internal rate limiting)
CREATE POLICY "Service all rate_limits"
  ON rate_limits FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. ml_models: Restrict public SELECT ───────────────────
-- Drop overly permissive public read
DROP POLICY IF EXISTS "authenticated_read_ml" ON ml_models;
DROP POLICY IF EXISTS "public_read_ml_models" ON ml_models;

-- Only authenticated users can read ML model data (prevents IP leak)
CREATE POLICY "Authenticated read ml_models"
  ON ml_models FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ── 5. ml_dl_models: Restrict public SELECT ────────────────
DROP POLICY IF EXISTS "authenticated_read_dl" ON ml_dl_models;
DROP POLICY IF EXISTS "public_read_ml_dl_models" ON ml_dl_models;

CREATE POLICY "Authenticated read ml_dl_models"
  ON ml_dl_models FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

-- ── 6. user_gamification: Add user read policy ─────────────
-- Users should be able to read their own gamification data
DO $$ BEGIN
  CREATE POLICY "Users read own gamification"
    ON user_gamification FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 7. user_achievements: Add user read policy ─────────────
DO $$ BEGIN
  CREATE POLICY "Users read own achievements"
    ON user_achievements FOR SELECT
    USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
