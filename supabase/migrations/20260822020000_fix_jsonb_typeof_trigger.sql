-- =============================================================
-- FIX: check_predictions_allowed() — jsonb_typeof(text[]) bug
-- The trigger called jsonb_typeof(NEW.numeros::jsonb) which fails
-- when the column is text[] type. Fixed by checking pg_typeof first.
-- =============================================================

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
  v_col_type  TEXT;
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
      -- Check column type first to avoid jsonb_typeof(text[]) error
      v_col_type := pg_typeof(NEW.numeros)::text;

      IF v_col_type = 'text[]' THEN
        -- text[] → treat as 2-cifras only (always allowed for free)
        -- No 3/4 cifras possible in text[] format
        NULL; -- do nothing, text[] is always 2-cifras
      ELSIF v_col_type = 'jsonb' THEN
        -- JSONB: check if it has '3' or '4' keys
        IF jsonb_typeof(NEW.numeros) = 'object' THEN
          v_numeros := NEW.numeros;
        ELSIF jsonb_typeof(NEW.numeros) = 'array' THEN
          -- Array could be [45,67] (flat) or ['{"2":[],"3":[]}'] (stringified JSON)
          IF jsonb_array_length(NEW.numeros) = 1
             AND jsonb_typeof(NEW.numeros->0) = 'string'
             AND (NEW.numeros->>0) LIKE '{%' THEN
            BEGIN
              v_numeros := (NEW.numeros->0)::JSONB;
            EXCEPTION WHEN OTHERS THEN
              v_numeros := NULL;
            END;
          ELSE
            v_numeros := jsonb_build_object('2', NEW.numeros);
          END IF;
        END IF;

        IF v_numeros IS NOT NULL THEN
          SELECT array_agg(key) INTO v_keys
          FROM jsonb_object_keys(v_numeros) key;

          IF v_keys IS NOT NULL AND ('3' = ANY(v_keys) OR '4' = ANY(v_keys)) THEN
            RAISE EXCEPTION 'Las predicciones de 3 y 4 cifras requieren suscripción premium.';
          END IF;
        END IF;
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
