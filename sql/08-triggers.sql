-- ============================================================================
-- 08-triggers.sql: Triggers and utility functions (fully idempotent)
-- ============================================================================

-- ============================================================================
-- 1. AUTO-SET trial_ends_at
-- ============================================================================
CREATE OR REPLACE FUNCTION set_trial_ends_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL AND NEW.role = 'free' THEN
    NEW.trial_ends_at := NOW() + INTERVAL '30 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_trial_ends_at ON user_profiles;
CREATE TRIGGER trigger_set_trial_ends_at
  BEFORE INSERT ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_trial_ends_at();

-- ============================================================================
-- 2. AUTO-UPDATE updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_updated_at ON user_profiles;
CREATE TRIGGER trigger_set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- 3. AUTO-CREATE user_profile on new auth user
-- ============================================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO user_profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'free')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================================
-- 4. AUTO-INCREMENT predictions_used
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_predictions_used()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_profiles
  SET predictions_used = predictions_used + 1, updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_predictions ON user_predictions;
CREATE TRIGGER trigger_increment_predictions
  AFTER INSERT ON user_predictions
  FOR EACH ROW EXECUTE FUNCTION increment_predictions_used();

-- ============================================================================
-- 5. CHECK PREDICTIONS ALLOWED (enforce free/premium limits)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_predictions_allowed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_profile RECORD;
BEGIN
  SELECT * INTO v_profile FROM user_profiles WHERE id = NEW.user_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'User profile not found'; END IF;
  IF v_profile.role IN ('admin', 'premium') THEN RETURN NEW; END IF;
  IF v_profile.predictions_used >= 30 THEN
    RAISE EXCEPTION 'Free tier prediction limit reached (30/month)';
  END IF;
  IF (array_length(NEW.numbers_3c, 1) > 0 OR array_length(NEW.numbers_4c, 1) > 0) THEN
    IF v_profile.premium_until IS NULL OR v_profile.premium_until < NOW() THEN
      RAISE EXCEPTION '3 and 4 cifras require premium access';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_predictions_allowed ON user_predictions;
CREATE TRIGGER check_predictions_allowed
  BEFORE INSERT ON user_predictions
  FOR EACH ROW EXECUTE FUNCTION check_predictions_allowed();

-- ============================================================================
-- 6. BACKTEST SUMMARY VIEW
-- ============================================================================
CREATE OR REPLACE VIEW backtest_summary AS
SELECT
  game_id, turno, model_type, COUNT(*) AS total_tests,
  SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END) AS hits_top1,
  SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END) AS hits_top5,
  SUM(CASE WHEN hit_at_10_2c THEN 1 ELSE 0 END) AS hits_top10,
  ROUND(SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 2) AS accuracy_top1_pct,
  ROUND(AVG(score_2c), 4) AS avg_score,
  SUM(roi_2c) AS total_roi,
  MIN(test_date) AS first_test, MAX(test_date) AS last_test
FROM backtest_results
GROUP BY game_id, turno, model_type;
