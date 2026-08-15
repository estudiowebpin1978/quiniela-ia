-- =============================================================
-- FASE 1 FINAL: Trigger de Verificación con Posiciones 1-20
-- =============================================================

-- STEP 1: Create/update trigger function with position tracking
CREATE OR REPLACE FUNCTION verify_predictions_on_draw_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pred_record    RECORD;
  nums2          TEXT[];
  nums3          TEXT[];
  nums4          TEXT[];
  pred2_arr      TEXT[];
  pred3_arr      TEXT[];
  pred4_arr      TEXT[];
  aciertos2_json JSONB := '[]'::JSONB;
  aciertos3_json JSONB := '[]'::JSONB;
  aciertos4_json JSONB := '[]'::JSONB;
  total_hits     INT;
  pred_numeros   JSONB;
  i              INT;
  hit_rec        JSONB;
  positions_list INT[] := '{}';
BEGIN
  IF NEW.numbers IS NULL OR array_length(NEW.numbers, 1) < 5 THEN
    RETURN NEW;
  END IF;

  nums2 := ARRAY(SELECT LPAD(MOD(v, 100)::TEXT, 2, '0') FROM unnest(NEW.numbers) v);
  nums3 := ARRAY(SELECT LPAD(MOD(v, 1000)::TEXT, 3, '0') FROM unnest(NEW.numbers) v);
  nums4 := ARRAY(SELECT LPAD(v::TEXT, 4, '0') FROM unnest(NEW.numbers) v);

  FOR pred_record IN
    SELECT id, user_id, numeros
    FROM user_predictions
    WHERE date = NEW.date AND turno = NEW.turno AND status = 'PENDING'
  LOOP
    IF pred_record.numeros IS NULL OR array_length(pred_record.numeros, 1) = 0 THEN
      CONTINUE;
    END IF;

    IF array_length(pred_record.numeros, 1) = 1 AND pred_record.numeros[1] LIKE '{%' THEN
      BEGIN
        pred_numeros := pred_record.numeros[1]::JSONB;
      EXCEPTION WHEN OTHERS THEN
        pred_numeros := NULL;
      END;
    ELSIF array_length(pred_record.numeros, 1) > 1 THEN
      pred_numeros := to_jsonb(pred_record.numeros);
    ELSE
      pred_numeros := NULL;
    END IF;

    IF pred_numeros IS NULL THEN CONTINUE; END IF;

    IF jsonb_typeof(pred_numeros) = 'object' THEN
      pred2_arr := ARRAY(
        SELECT LPAD(v, 2, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'2', '[]'::JSONB)) v
      );
      pred3_arr := ARRAY(
        SELECT LPAD(v, 3, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'3', '[]'::JSONB)) v
      );
      pred4_arr := ARRAY(
        SELECT LPAD(v, 4, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'4', '[]'::JSONB)) v
      );
    ELSE
      pred2_arr := ARRAY(SELECT LPAD(v, 2, '0') FROM jsonb_array_elements_text(pred_numeros) v);
      pred3_arr := '{}';
      pred4_arr := '{}';
    END IF;

    aciertos2_json := '[]'::JSONB;
    positions_list := '{}';
    FOR i IN 1..COALESCE(array_length(pred2_arr, 1), 0) LOOP
      IF pred2_arr[i] = ANY(nums2) THEN
        hit_rec := jsonb_build_object('numero', pred2_arr[i], 'puesto', array_position(nums2, pred2_arr[i]));
        aciertos2_json := aciertos2_json || hit_rec;
        positions_list := array_append(positions_list, array_position(nums2, pred2_arr[i]));
      END IF;
    END LOOP;

    aciertos3_json := '[]'::JSONB;
    FOR i IN 1..COALESCE(array_length(pred3_arr, 1), 0) LOOP
      IF pred3_arr[i] = ANY(nums3) THEN
        hit_rec := jsonb_build_object('numero', pred3_arr[i], 'puesto', array_position(nums3, pred3_arr[i]));
        aciertos3_json := aciertos3_json || hit_rec;
        positions_list := array_append(positions_list, array_position(nums3, pred3_arr[i]));
      END IF;
    END LOOP;

    aciertos4_json := '[]'::JSONB;
    FOR i IN 1..COALESCE(array_length(pred4_arr, 1), 0) LOOP
      IF pred4_arr[i] = ANY(nums4) THEN
        hit_rec := jsonb_build_object('numero', pred4_arr[i], 'puesto', array_position(nums4, pred4_arr[i]));
        aciertos4_json := aciertos4_json || hit_rec;
        positions_list := array_append(positions_list, array_position(nums4, pred4_arr[i]));
      END IF;
    END LOOP;

    total_hits := jsonb_array_length(aciertos2_json) + jsonb_array_length(aciertos3_json) + jsonb_array_length(aciertos4_json);

    UPDATE user_predictions
    SET status = CASE WHEN total_hits > 0 THEN 'WON' ELSE 'LOST' END,
        aciertos = positions_list,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = pred_record.id;

    INSERT INTO prediction_history (
      prediction_id, user_id, date, turno,
      numeros_2, numeros_3, numeros_4,
      resultado_oficial,
      aciertos_2, aciertos_3, aciertos_4,
      total_aciertos, verified, verified_at, game_id
    ) VALUES (
      pred_record.id, pred_record.user_id, NEW.date, NEW.turno,
      pred2_arr, pred3_arr, pred4_arr,
      NEW.numbers,
      aciertos2_json, aciertos3_json, aciertos4_json,
      total_hits, true, NOW(), NEW.game_id
    )
    ON CONFLICT (prediction_id) DO UPDATE SET
      aciertos_2 = EXCLUDED.aciertos_2,
      aciertos_3 = EXCLUDED.aciertos_3,
      aciertos_4 = EXCLUDED.aciertos_4,
      total_aciertos = EXCLUDED.total_aciertos,
      resultado_oficial = EXCLUDED.resultado_oficial,
      verified = true,
      verified_at = NOW();

    INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified)
    VALUES (
      pred_record.user_id, 1, total_hits,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_predictions = user_stats.total_predictions + 1,
      total_hits = user_stats.total_hits + EXCLUDED.total_hits,
      current_streak = CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END,
      best_streak = GREATEST(user_stats.best_streak, CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END),
      last_verified = NOW();

  END LOOP;

  RETURN NEW;
END $$;


-- STEP 2: Recreate trigger
DROP TRIGGER IF EXISTS trg_verify_predictions ON draws;
CREATE TRIGGER trg_verify_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION verify_predictions_on_draw_insert();
