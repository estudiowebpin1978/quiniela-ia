-- ============================================================================
-- 08-triggers.sql: Database triggers and utility functions
-- Ejecutar DESPUÉS de 07-indexes.sql
-- ============================================================================

-- ============================================================================
-- 1. AUTO-SET trial_ends_at on new free users
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
-- 2. AUTO-UPDATE updated_at on user_profiles
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
-- 4. AUTO-INCREMENT predictions_used on new prediction
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_predictions_used()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE user_profiles
  SET predictions_used = predictions_used + 1,
      updated_at = NOW()
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_increment_predictions ON user_predictions;
CREATE TRIGGER trigger_increment_predictions
  AFTER INSERT ON user_predictions
  FOR EACH ROW EXECUTE FUNCTION increment_predictions_used();

-- ============================================================================
-- 5. CLEAN OLD PREDICTIONS (called by cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION clean_old_predictions(p_older_than_days INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM user_predictions
  WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
    AND id NOT IN (SELECT prediction_id FROM prediction_history);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- 6. PREVENT expired trial from accessing premium (trigger on user_predictions)
-- ============================================================================
CREATE OR REPLACE FUNCTION check_predictions_allowed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_profile RECORD;
  v_count INT;
BEGIN
  SELECT * INTO v_profile
  FROM user_profiles
  WHERE id = NEW.user_id;

  IF v_profile IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  -- Admin bypass
  IF v_profile.role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Premium bypass
  IF v_profile.role = 'premium' THEN
    RETURN NEW;
  END IF;

  -- Check predictions limit (free users: 30 per month)
  IF v_profile.predictions_used >= 30 THEN
    RAISE EXCEPTION 'Free tier prediction limit reached (30/month). Upgrade to premium.';
  END IF;

  -- Check if trying to save 3/4 cifras without premium access
  IF (array_length(NEW.numbers_3c, 1) > 0 OR array_length(NEW.numbers_4c, 1) > 0) THEN
    IF v_profile.role = 'free' AND v_profile.trial_ends_at > NOW() THEN
      -- Trial active - allow
      RETURN NEW;
    ELSIF v_profile.premium_until IS NULL OR v_profile.premium_until < NOW() THEN
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
-- 7. BACKTEST SUMMARY VIEW
-- ============================================================================
CREATE OR REPLACE VIEW backtest_summary AS
SELECT
  game_id,
  turno,
  model_type,
  COUNT(*) AS total_tests,
  SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END) AS hits_top1,
  SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END) AS hits_top5,
  SUM(CASE WHEN hit_at_10_2c THEN 1 ELSE 0 END) AS hits_top10,
  ROUND(SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 2) AS accuracy_top1_pct,
  ROUND(SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END)::NUMERIC / GREATEST(COUNT(*), 1) * 100, 2) AS accuracy_top5_pct,
  ROUND(AVG(score_2c), 4) AS avg_score,
  SUM(roi_2c) AS total_roi,
  MIN(test_date) AS first_test,
  MAX(test_date) AS last_test
FROM backtest_results
GROUP BY game_id, turno, model_type;

-- ============================================================================
-- 8. USER STATS VIEW (for admin dashboard)
-- ============================================================================
CREATE OR REPLACE VIEW user_stats AS
SELECT
  up.id,
  up.email,
  up.role,
  up.predictions_used,
  up.trial_ends_at,
  up.premium_until,
  up.created_at,
  COUNT(DISTINCT ph.id) AS total_verified,
  SUM(CASE WHEN ph.hit_2c THEN 1 ELSE 0 END) AS hits_2c,
  SUM(CASE WHEN ph.hit_3c THEN 1 ELSE 0 END) AS hits_3c,
  SUM(CASE WHEN ph.hit_4c THEN 1 ELSE 0 END) AS hits_4c,
  ROUND(
    SUM(CASE WHEN ph.hit_2c THEN 1 ELSE 0 END)::NUMERIC /
    GREATEST(COUNT(ph.id), 1) * 100, 2
  ) AS accuracy_2c_pct
FROM user_profiles up
LEFT JOIN prediction_history ph ON ph.user_id = up.id
GROUP BY up.id, up.email, up.role, up.predictions_used,
         up.trial_ends_at, up.premium_until, up.created_at;

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION clean_old_predictions TO service_role;
GRANT SELECT ON backtest_summary TO authenticated;
GRANT SELECT ON user_stats TO service_role;
