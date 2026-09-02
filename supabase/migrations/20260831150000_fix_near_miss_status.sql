-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: NEAR_MISS status + trigger semantics (FIX-NEAR-MISS-20260831)
-- ══════════════════════════════════════════════════════════════════════════════
-- Problem: Near-miss was forced to status='WON' to evade a CHECK constraint.
--          This is a fatal business error — near-miss means the user LOST.
-- Solution: Add NEAR_MISS to CHECK constraint, update trigger to use it.

-- ── 1. DROP old CHECK constraint on user_predictions ──
ALTER TABLE user_predictions
  DROP CONSTRAINT IF EXISTS user_predictions_status_check;

-- ── 2. ADD new CHECK constraint with NEAR_MISS ──
ALTER TABLE user_predictions
  ADD CONSTRAINT user_predictions_status_check
  CHECK (status IN ('PENDING', 'WON', 'LOST', 'NEAR_MISS'));

-- ── 3. UPDATE trigger: near-miss → status='NEAR_MISS' (not 'WON') ──
CREATE OR REPLACE FUNCTION verify_user_predictions_after_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza TEXT;
  v_nums2 TEXT[];
  v_nums3 TEXT[];
  v_nums4 TEXT[];
  v_pred RECORD;
  v_numeros_field_type TEXT;
  v_numeros_raw TEXT;
  v_pred_nums2 TEXT[];
  v_pred_nums3 TEXT[];
  v_pred_nums4 TEXT[];
  v_has_hit BOOLEAN;
  v_has_near BOOLEAN;
  v_aciertos_2 JSONB := '[]'::jsonb;
  v_aciertos_3 JSONB := '[]'::jsonb;
  v_aciertos_4 JSONB := '[]'::jsonb;
  v_status TEXT;
  v_total_aciertos INTEGER;
  v_is_hit BOOLEAN;
  v_new_streak INTEGER;
BEGIN
  v_cabeza := LPAD(NEW.cabeza::TEXT, 2, '0');

  v_nums2 := ARRAY(SELECT LPAD(MOD(x, 100)::TEXT, 2, '0') FROM unnest(NEW.premios) x);
  v_nums3 := ARRAY(SELECT LPAD(MOD(x, 1000)::TEXT, 3, '0') FROM unnest(NEW.premios) x);
  v_nums4 := ARRAY(SELECT LPAD(x::TEXT, 4, '0') FROM unnest(NEW.premios) x);

  FOR v_pred IN
    SELECT up.id, up.user_id, up.numeros
    FROM user_predictions up
    WHERE up.date = NEW.date
      AND up.turno = NEW.turno
      AND up.status = 'PENDING'
  LOOP
    v_numeros_field_type := pg_typeof(v_pred.numeros)::text;

    IF v_numeros_field_type = 'text[]' THEN
      v_numeros_raw := v_pred.numeros[1];

      IF v_numeros_raw IS NOT NULL AND v_numeros_raw LIKE '{%' THEN
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'2')
        );
        v_pred_nums3 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'3')
        ), ARRAY[]::text[]);
        v_pred_nums4 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'4')
        ), ARRAY[]::text[]);
      ELSE
        v_pred_nums2 := v_pred.numeros;
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      END IF;

    ELSIF v_numeros_field_type = 'jsonb' THEN
      IF jsonb_typeof(v_pred.numeros::jsonb) = 'object' THEN
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'2')
        );
        v_pred_nums3 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'3')
        ), ARRAY[]::text[]);
        v_pred_nums4 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'4')
        ), ARRAY[]::text[]);
      ELSIF jsonb_typeof(v_pred.numeros::jsonb) = 'array' THEN
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text(v_pred.numeros::jsonb)
        );
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      ELSE
        v_pred_nums2 := ARRAY[]::text[];
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      END IF;
    ELSE
      CONTINUE;
    END IF;

    IF array_length(v_pred_nums2, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- ── Matching: exact hit ──
    v_has_hit := v_cabeza = ANY(v_pred_nums2);

    -- ── Near-miss: ±1 from cabeza ──
    v_has_near := NOT v_has_hit AND EXISTS (
      SELECT 1 FROM unnest(v_pred_nums2) p
      WHERE ABS(p::INT - NEW.cabeza) = 1
    );

    -- ── FIX: Near-miss = LOST (financial loss), NOT WON ──
    IF v_has_hit THEN
      v_status := 'WON';
    ELSIF v_has_near THEN
      v_status := 'NEAR_MISS';  -- User lost money but was close
    ELSE
      v_status := 'LOST';
    END IF;

    -- ── aciertos_2: {numero, puesto} — distinguishes exact vs near ──
    v_aciertos_2 := '[]'::jsonb;
    v_total_aciertos := 0;

    IF v_has_hit THEN
      v_aciertos_2 := jsonb_build_array(
        jsonb_build_object('numero', v_cabeza, 'puesto', 1)
      );
      v_total_aciertos := 1;
    ELSIF v_has_near THEN
      v_aciertos_2 := jsonb_build_array(
        jsonb_build_object('numero', v_cabeza, 'puesto', 0)
      );
      -- v_total_aciertos stays 0 — near-miss counts as 0 hits
    END IF;

    -- ── Check 3 cifras (premium only) ──
    v_aciertos_3 := '[]'::jsonb;
    IF array_length(v_pred_nums3, 1) > 0 THEN
      FOR i IN 1..array_length(v_pred_nums3, 1) LOOP
        IF LPAD(NEW.cabeza::TEXT, 3, '0') = v_pred_nums3[i] THEN
          v_aciertos_3 := v_aciertos_3 || jsonb_build_array(
            jsonb_build_object('numero', v_pred_nums3[i], 'puesto', i)
          );
          v_total_aciertos := v_total_aciertos + 1;
        END IF;
      END LOOP;
    END IF;

    -- ── Check 4 cifras (premium only) ──
    v_aciertos_4 := '[]'::jsonb;
    IF array_length(v_pred_nums4, 1) > 0 THEN
      FOR i IN 1..array_length(v_pred_nums4, 1) LOOP
        IF LPAD(NEW.cabeza::TEXT, 4, '0') = v_pred_nums4[i] THEN
          v_aciertos_4 := v_aciertos_4 || jsonb_build_array(
            jsonb_build_object('numero', v_pred_nums4[i], 'puesto', i)
          );
          v_total_aciertos := v_total_aciertos + 1;
        END IF;
      END LOOP;
    END IF;

    -- ── Insert prediction_history ──
    INSERT INTO prediction_history (
      prediction_id, user_id, date, turno,
      numeros_2, numeros_3, numeros_4,
      resultado_oficial,
      aciertos_2, aciertos_3, aciertos_4,
      total_aciertos,
      verified, verified_at, game_id,
      redoblonas, aciertos_redoblona
    ) VALUES (
      v_pred.id, v_pred.user_id, NEW.date, NEW.turno,
      v_pred_nums2, v_pred_nums3, v_pred_nums4,
      to_jsonb(NEW.premios),
      v_aciertos_2, v_aciertos_3, v_aciertos_4,
      v_total_aciertos,
      true, NOW(), NEW.game_id,
      NULL, NULL
    )
    ON CONFLICT (prediction_id) DO NOTHING;

    -- ── Update prediction status ──
    v_is_hit := v_total_aciertos > 0;
    UPDATE user_predictions
    SET status = v_status,
        aciertos = ARRAY[CASE WHEN v_is_hit THEN 1 ELSE 0 END],
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = v_pred.id;

    -- ── Update user_stats with streaks ──
    IF v_is_hit THEN
      v_new_streak := 1;
    ELSE
      v_new_streak := 0;
    END IF;

    INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified, updated_at)
    VALUES (
      v_pred.user_id,
      1,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_predictions = user_stats.total_predictions + 1,
      total_hits = user_stats.total_hits + CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      current_streak = CASE
        WHEN v_is_hit THEN user_stats.current_streak + 1
        ELSE 0
      END,
      best_streak = GREATEST(
        user_stats.best_streak,
        CASE WHEN v_is_hit THEN user_stats.current_streak + 1 ELSE 0 END
      ),
      last_verified = NOW(),
      updated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;
