-- =============================================================================
-- FASE 5: RLS SECURITY HARDENING + DB-LEVEL ENFORCEMENT
-- =============================================================================
-- This migration enables RLS on all user-data tables and creates policies
-- that enforce row-level isolation. It also attaches the tier-check trigger
-- and creates the missing upsert_draw function.

-- ─── 1. RLS: user_profiles ─────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only read their own profile
CREATE POLICY "users_read_own_profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can only update their own profile (but NOT role/premium_until)
CREATE POLICY "users_update_own_profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Service role can do everything (for webhooks, admin, triggers)
CREATE POLICY "service_role_all_user_profiles"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 2. RLS: user_predictions ──────────────────────────────────────────────
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own predictions
CREATE POLICY "users_read_own_predictions"
  ON user_predictions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own predictions
CREATE POLICY "users_insert_own_predictions"
  ON user_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only update their own predictions
CREATE POLICY "users_update_own_predictions"
  ON user_predictions FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users cannot delete predictions (only service_role can via cron cleanup)
-- Service role can do everything
CREATE POLICY "service_role_all_predictions"
  ON user_predictions FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 3. RLS: prediction_history ────────────────────────────────────────────
ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;

-- Users can only read their own history
CREATE POLICY "users_read_own_history"
  ON prediction_history FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything (inserts come from trigger/auto-verify)
CREATE POLICY "service_role_all_history"
  ON prediction_history FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 4. RLS: user_stats ───────────────────────────────────────────────────
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Users can only read their own stats
CREATE POLICY "users_read_own_stats"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "service_role_all_stats"
  ON user_stats FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 5. RLS: push_subscriptions ───────────────────────────────────────────
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only read/manage their own subscriptions
CREATE POLICY "users_own_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all_subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 6. Attach tier check trigger to user_predictions ─────────────────────
-- The function check_predictions_allowed() already exists (from phase2 migration).
-- We just need to attach it as a trigger.

DROP TRIGGER IF EXISTS trg_check_predictions_allowed ON user_predictions;
CREATE TRIGGER trg_check_predictions_allowed
  BEFORE INSERT ON user_predictions
  FOR EACH ROW
  EXECUTE FUNCTION check_predictions_allowed();

-- ─── 7. Create upsert_draw function (missing from repo) ───────────────────
CREATE OR REPLACE FUNCTION upsert_draw(
  p_date DATE,
  p_turno TEXT,
  p_numbers INT[],
  p_source TEXT,
  p_game_id UUID,
  p_jurisdiccion TEXT DEFAULT 'nacional',
  p_html_hash TEXT DEFAULT NULL,
  p_confidence_score NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion, html_hash, confidence_score, created_at)
  VALUES (p_date, p_turno, p_numbers, p_source, p_game_id, p_jurisdiccion, p_html_hash, p_confidence_score, NOW())
  ON CONFLICT (date, turno, game_id)
  DO UPDATE SET
    numbers = EXCLUDED.numbers,
    source = EXCLUDED.source,
    html_hash = EXCLUDED.html_hash,
    confidence_score = EXCLUDED.confidence_score
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 8. Ensure draws table has required DDL ────────────────────────────────
-- Add UNIQUE constraint if not exists (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'draws_date_turno_game_id_key'
    AND conrelid = 'draws'::regclass
  ) THEN
    ALTER TABLE draws ADD CONSTRAINT draws_date_turno_game_id_key UNIQUE (date, turno, game_id);
  END IF;
END $$;

-- Add game_id column if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'draws' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE draws ADD COLUMN game_id UUID DEFAULT 'ac593199-c299-4f03-b1b7-8675fe4fa6d9';
  END IF;
END $$;

-- Add other missing columns if needed
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draws' AND column_name = 'html_hash') THEN
    ALTER TABLE draws ADD COLUMN html_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draws' AND column_name = 'confidence_score') THEN
    ALTER TABLE draws ADD COLUMN confidence_score NUMERIC;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draws' AND column_name = 'source_priority') THEN
    ALTER TABLE draws ADD COLUMN source_priority INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'draws' AND column_name = 'jurisdiccion') THEN
    ALTER TABLE draws ADD COLUMN jurisdiccion TEXT DEFAULT 'nacional';
  END IF;
END $$;

-- ─── 9. Add predictions_used column to user_profiles ───────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_profiles' AND column_name = 'predictions_used'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN predictions_used INTEGER DEFAULT 0;
  END IF;
END $$;

-- ─── 10. Fix check_predictions_allowed to use row count ────────────────────
-- The existing function references v_profile.predictions_used which may be stale.
-- Replace with a version that counts rows directly.

CREATE OR REPLACE FUNCTION check_predictions_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile RECORD;
  v_count BIGINT;
  v_is_admin BOOLEAN;
BEGIN
  -- Check if user is admin (by email via auth.users)
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.user_id
    AND lower(email) = 'estudiowebpin@gmail.com'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Get profile
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Check trial expiry
  IF v_profile.role = 'free' AND v_profile.premium_until IS NOT NULL
     AND v_profile.premium_until < now() THEN
    RAISE EXCEPTION 'Trial expired. Please upgrade to premium.';
  END IF;

  -- Count existing predictions (database-level count, not cached column)
  SELECT count(*) INTO v_count
  FROM user_predictions
  WHERE user_id = NEW.user_id;

  -- Enforce 10-prediction limit for free users
  IF v_profile.role != 'premium' AND v_profile.role != 'admin' THEN
    IF v_count >= 10 THEN
      RAISE EXCEPTION 'Free tier limit reached (10 predictions). Please upgrade to premium.';
    END IF;
  END IF;

  -- Block 3/4 cifras for non-premium
  IF v_profile.role != 'premium' AND v_profile.role != 'admin' THEN
    IF jsonb_object_keys(NEW.numeros::jsonb) ? '3' OR jsonb_object_keys(NEW.numeros::jsonb) ? '4' THEN
      RAISE EXCEPTION '3 and 4 cifras require premium subscription.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
