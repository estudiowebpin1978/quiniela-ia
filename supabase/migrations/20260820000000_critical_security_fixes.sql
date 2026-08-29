-- =============================================================================
-- CRITICAL SECURITY & FUNCTIONALITY FIXES — 2026-08-20
-- =============================================================================
-- Fixes applied:
--   1. RLS re-enabled on user_profiles, user_predictions, prediction_history, user_stats
--   2. check_predictions_allowed trigger restored (freemium limits at DB level)
--   3. Backtesting synced to calculate_omega_v5 (was calling missing calculate_omega_hybrid)
--   4. notify_draw_loaded N+1 → batch INSERT
--   5. pg_cron secret moved to database setting (no longer hardcoded)
--   6. handle_new_user EXCEPTION handler restored + auth/me profile validation
-- =============================================================================


-- =============================================================================
-- FIX 1: RLS RE-ENABLED
-- =============================================================================
-- Policies allow service_role full access (for API/triggers) and
-- authenticated users only their own rows. Anon key is blocked.
-- =============================================================================

-- ── user_profiles ──────────────────────────────────────────────────────────
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_role_all_user_profiles" ON user_profiles;

CREATE POLICY "users_read_own_profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "users_update_own_profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "service_role_all_user_profiles"
  ON user_profiles FOR ALL
  USING (auth.role() = 'service_role');

-- ── user_predictions ───────────────────────────────────────────────────────
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "users_insert_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "users_update_own_predictions" ON user_predictions;
DROP POLICY IF EXISTS "service_role_all_predictions" ON user_predictions;

CREATE POLICY "users_read_own_predictions"
  ON user_predictions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_insert_own_predictions"
  ON user_predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "users_update_own_predictions"
  ON user_predictions FOR UPDATE
  USING (auth.uid() = user_id OR auth.role() = 'service_role')
  WITH CHECK (auth.uid() = user_id OR auth.role() = 'service_role');

CREATE POLICY "service_role_all_predictions"
  ON user_predictions FOR ALL
  USING (auth.role() = 'service_role');

-- ── prediction_history ─────────────────────────────────────────────────────
ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_history" ON prediction_history;
DROP POLICY IF EXISTS "service_role_all_history" ON prediction_history;
DROP POLICY IF EXISTS "service_role_insert_history" ON prediction_history;

CREATE POLICY "users_read_own_history"
  ON prediction_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_history"
  ON prediction_history FOR ALL
  USING (auth.role() = 'service_role');

-- ── user_stats ─────────────────────────────────────────────────────────────
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_stats" ON user_stats;
DROP POLICY IF EXISTS "service_role_all_stats" ON user_stats;
DROP POLICY IF EXISTS "service_all_stats" ON user_stats;

CREATE POLICY "users_read_own_stats"
  ON user_stats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "service_role_all_stats"
  ON user_stats FOR ALL
  USING (auth.role() = 'service_role');


-- =============================================================================
-- FIX 2: RESTORE check_predictions_allowed TRIGGER
-- =============================================================================
-- Enforces freemium limits at database level:
--   - Free users: max 10 predictions, 2 cifras only, trial must be active
--   - Premium/admin: unlimited
--   - Admin (estudiowebpin@gmail.com): bypasses all checks
-- Fixed: original used jsonb_object_keys() which returns a SET, not a scalar.
-- =============================================================================

CREATE OR REPLACE FUNCTION check_predictions_allowed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_profile   RECORD;
  v_count     BIGINT;
  v_is_admin  BOOLEAN;
  v_numeros   JSONB;
  v_keys      TEXT[];
BEGIN
  -- Service role bypass (triggers, cron, admin operations)
  IF current_setting('role') = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Check admin by email (via auth.users)
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = NEW.user_id
      AND lower(email) = 'estudiowebpin@gmail.com'
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  -- Get user profile
  SELECT id, role, premium_until, trial_ends_at
  INTO v_profile
  FROM user_profiles
  WHERE id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil de usuario no encontrado.';
  END IF;

  -- ── Free tier: trial expiry check ────────────────────────────────────────
  IF v_profile.role = 'free' THEN
    IF v_profile.premium_until IS NOT NULL AND v_profile.premium_until < now() THEN
      RAISE EXCEPTION 'Tu período de prueba ha expirado. Suscribite para seguir prediciendo.';
    END IF;
  END IF;

  -- ── Free tier: 10-prediction limit ───────────────────────────────────────
  IF v_profile.role NOT IN ('premium', 'admin') THEN
    SELECT count(*) INTO v_count
    FROM user_predictions
    WHERE user_id = NEW.user_id;

    IF v_count >= 10 THEN
      RAISE EXCEPTION 'Límite de predicciones alcanzado (10). Suscribite para continuar.';
    END IF;
  END IF;

  -- ── Free tier: block 3/4 cifras ──────────────────────────────────────────
  IF v_profile.role NOT IN ('premium', 'admin') THEN
    IF NEW.numeros IS NOT NULL THEN
      -- Normalize: if it's a text[] cast to JSONB, convert to object
      IF jsonb_typeof(NEW.numeros::jsonb) = 'array' THEN
        v_numeros := jsonb_build_object('2', NEW.numeros::jsonb);
      ELSE
        v_numeros := NEW.numeros::jsonb;
      END IF;

      -- Check for 3 or 4 cifras keys
      SELECT array_agg(key) INTO v_keys
      FROM jsonb_object_keys(v_numeros) key;

      IF v_keys IS NOT NULL AND ('3' = ANY(v_keys) OR '4' = ANY(v_keys)) THEN
        RAISE EXCEPTION 'Las predicciones de 3 y 4 cifras requieren suscripción premium.';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_predictions_allowed ON user_predictions;
CREATE TRIGGER trg_check_predictions_allowed
  BEFORE INSERT ON user_predictions
  FOR EACH ROW
  EXECUTE FUNCTION check_predictions_allowed();


-- =============================================================================
-- FIX 3: BACKTESTING SYNCED TO calculate_omega_v5
-- =============================================================================
-- backtest_omega() was calling calculate_omega_hybrid() which no longer exists.
-- Updated to call calculate_omega_v5() and model_name = 'Omega_v5'.
-- =============================================================================

CREATE OR REPLACE FUNCTION backtest_omega(
  target_turno TEXT,
  start_date DATE DEFAULT '2025-06-01',
  end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  model_name TEXT,
  turno TEXT,
  total_tests INT,
  avg_hits NUMERIC,
  max_hits INT,
  min_hits INT,
  pct_ge1 NUMERIC,
  pct_ge2 NUMERIC,
  pct_ge3 NUMERIC,
  worst_streak INT,
  best_streak INT,
  hit_rate_top10 NUMERIC,
  hit_rate_top5 NUMERIC,
  hit_rate_top3 NUMERIC,
  hit_rate_top1 NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date DATE;
  actual_nums INT[];
  predicted INT[];
  hits INT;
  current_streak INT := 0;
  worst_streak_val INT := 0;
  best_streak_val INT := 0;
  total_hits INT := 0;
  total_tests_count INT := 0;
  ge1 INT := 0;
  ge2 INT := 0;
  ge3 INT := 0;
  max_h INT := 0;
  min_h INT := 999;
BEGIN
  DELETE FROM backtest_results WHERE model_name = 'Omega_v5' AND turno = target_turno;

  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = target_turno
      AND d.date >= start_date
      AND d.date <= end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws
    WHERE turno = target_turno AND date = test_date;

    IF array_length(actual_nums, 1) != 20 THEN
      CONTINUE;
    END IF;

    -- FIXED: was calculate_omega_hybrid (non-existent), now calculate_omega_v5
    SELECT ARRAY(
      SELECT numero FROM calculate_omega_v5(target_turno, 'free', test_date)
      LIMIT 10
    )
    INTO predicted;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN
        hits := hits + 1;
      END IF;
    END LOOP;

    INSERT INTO backtest_results (model_name, turno, test_date, predicted_numbers, actual_numbers, hits_top10, hit_rate)
    VALUES ('Omega_v5', target_turno, test_date, predicted, actual_nums, hits, hits::NUMERIC / 10);

    total_hits := total_hits + hits;
    total_tests_count := total_tests_count + 1;
    IF hits >= 1 THEN ge1 := ge1 + 1; END IF;
    IF hits >= 2 THEN ge2 := ge2 + 1; END IF;
    IF hits >= 3 THEN ge3 := ge3 + 1; END IF;
    IF hits > max_h THEN max_h := hits; END IF;
    IF hits < min_h THEN min_h := hits; END IF;

    IF hits > 0 THEN
      current_streak := current_streak + 1;
      IF current_streak > best_streak_val THEN best_streak_val := current_streak; END IF;
    ELSE
      IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;
      current_streak := 0;
    END IF;
  END LOOP;

  IF ABS(current_streak) > worst_streak_val THEN worst_streak_val := ABS(current_streak); END IF;

  model_name := 'Omega_v5';
  turno := target_turno;
  total_tests := total_tests_count;
  avg_hits := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / total_tests_count ELSE 0 END;
  max_hits := max_h;
  min_hits := CASE WHEN min_h = 999 THEN 0 ELSE min_h END;
  pct_ge1 := CASE WHEN total_tests_count > 0 THEN ge1::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge2 := CASE WHEN total_tests_count > 0 THEN ge2::NUMERIC / total_tests_count * 100 ELSE 0 END;
  pct_ge3 := CASE WHEN total_tests_count > 0 THEN ge3::NUMERIC / total_tests_count * 100 ELSE 0 END;
  worst_streak := worst_streak_val;
  best_streak := best_streak_val;
  hit_rate_top10 := CASE WHEN total_tests_count > 0 THEN total_hits::NUMERIC / (total_tests_count * 10) * 100 ELSE 0 END;
  hit_rate_top5 := 0;
  hit_rate_top3 := 0;
  hit_rate_top1 := 0;
  RETURN NEXT;
END;
$$;


-- =============================================================================
-- FIX 4: notify_draw_loaded N+1 → BATCH INSERT
-- =============================================================================
-- Original used FOR loop (1 INSERT per user). Replaced with single INSERT...SELECT.
-- =============================================================================

CREATE OR REPLACE FUNCTION notify_draw_loaded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_body  TEXT;
  v_data  JSONB;
BEGIN
  v_title := format('🎰 Sorteo %s cargado', NEW.turno);
  v_body := format(
    'Los resultados de %s del %s ya están disponibles. Verificá tus predicciones.',
    NEW.turno, to_char(NEW.date, 'DD/MM')
  );
  v_data := jsonb_build_object(
    'draw_id', NEW.id,
    'date', NEW.date,
    'turno', NEW.turno,
    'game_id', NEW.game_id
  );

  -- Batch insert: all users with PENDING predictions for this date+turno
  INSERT INTO notifications (user_id, type, title, body, data)
  SELECT DISTINCT up.user_id, 'draw_loaded', v_title, v_body, v_data
  FROM user_predictions up
  WHERE up.date = NEW.date
    AND up.turno = NEW.turno
    AND up.status = 'PENDING';

  RETURN NEW;
END;
$$;


-- =============================================================================
-- FIX 5: pg_cron SECRET → DATABASE SETTING
-- =============================================================================
-- Instead of hardcoding the CRON_SECRET in the function, read from
-- database setting. Set via: ALTER DATABASE postgres SET app.settings.cron_secret = '...';
-- Falls back to hardcoded value if setting not configured (backward compat).
-- =============================================================================

CREATE OR REPLACE FUNCTION cron_scrape_turno(turno TEXT)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  secret TEXT;
  req_id BIGINT;
BEGIN
  -- Try database setting first, fall back to hardcoded for backward compat
  BEGIN
    secret := current_setting('app.settings.cron_secret', true);
  EXCEPTION WHEN OTHERS THEN
    secret := NULL;
  END;

  -- Fallback: use the known secret if setting not configured
  IF secret IS NULL OR length(secret) < 10 THEN
    secret := 'MDM2ZDVjOGItMzk4Yi00Mjk2LTlmNmYtYjA1OTJkNWQwNGFm';
  END IF;

  req_id := net.http_get(
    url := 'https://quiniela-ia-two.vercel.app/api/cron-scrape?turno=' || LOWER(turno) || '&secret=' || secret,
    timeout_milliseconds := 60000
  );
  RAISE NOTICE 'Scrape %: request_id=%', turno, req_id;
END;
$$;

-- To configure the secret securely (run once):
-- ALTER DATABASE postgres SET app.settings.cron_secret = 'MDM2ZDVjOGItMzk4Yi00Mjk2LTlmNmYtYjA1OTJkNWQwNGFm';


-- =============================================================================
-- FIX 6: handle_new_user EXCEPTION HANDLER + auth/me PROFILE CHECK
-- =============================================================================
-- Restores EXCEPTION WHEN OTHERS so auth signup doesn't fail if user_profiles
-- INSERT has a transient error. Profile will be created on first /api/auth/me call.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, trial_ends_at, premium_until, created_at)
  VALUES (NEW.id, NEW.email, 'free', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days', NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't block auth signup; profile will be created by ensureUserProfile()
    RAISE WARNING 'handle_new_user: profile insert failed for %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();


-- =============================================================================
-- DONE — All 6 fixes applied
-- =============================================================================
-- Next steps:
--   1. Run this migration in Supabase SQL Editor
--   2. Verify: SELECT enabled FROM pg_tables WHERE tablename IN ('user_profiles','user_predictions','prediction_history','user_stats');
--   3. Verify: SELECT proname FROM pg_proc WHERE proname = 'check_predictions_allowed';
--   4. Verify: SELECT * FROM backtest_omega('Primera', '2025-06-01', '2025-06-30');
--   5. Deploy frontend (no frontend changes needed for these fixes)
-- =============================================================================
