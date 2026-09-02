CREATE OR REPLACE FUNCTION verify_predictions_on_draw_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $func$
DECLARE
  pred_record      RECORD;
  nums2            TEXT[];
  nums3            TEXT[];
  nums4            TEXT[];
  pred2_arr        TEXT[];
  pred3_arr        TEXT[];
  pred4_arr        TEXT[];
  pred_redoblona   TEXT;
  pred_cabeza      TEXT;
  pred_acompanante TEXT;
  aciertos2_json   JSONB := '[]'::JSONB;
  aciertos3_json   JSONB := '[]'::JSONB;
  aciertos4_json   JSONB := '[]'::JSONB;
  aciertos_red_json JSONB := '[]'::JSONB;
  total_hits       INT;
  pred_numeros     JSONB;
  i                INT;
  hit_rec          JSONB;
  unique_positions INT[] := '{}';
  pos              INT;
  red_cabeza_pos   INT;
  red_acomp_pos    INT;
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
    IF pred_record.numeros IS NULL THEN
      CONTINUE;
    END IF;

    IF pg_typeof(pred_record.numeros) = 'text[]'::regtype THEN
      IF array_length(pred_record.numeros, 1) = 1
         AND pred_record.numeros[1] LIKE '{%' THEN
        BEGIN
          pred_numeros := pred_record.numeros[1]::JSONB;
        EXCEPTION WHEN OTHERS THEN
          pred_numeros := jsonb_build_object('2', to_jsonb(pred_record.numeros));
        END;
      ELSE
        pred_numeros := jsonb_build_object('2', to_jsonb(pred_record.numeros));
      END IF;
    ELSIF jsonb_typeof(pred_record.numeros) = 'object' THEN
      pred_numeros := pred_record.numeros;
    ELSIF jsonb_typeof(pred_record.numeros) = 'array' THEN
      IF jsonb_array_length(pred_record.numeros) = 1
         AND jsonb_typeof(pred_record.numeros->0) = 'string'
         AND (pred_record.numeros->>0) LIKE '{%' THEN
        BEGIN
          pred_numeros := (pred_record.numeros->0)::JSONB;
        EXCEPTION WHEN OTHERS THEN
          pred_numeros := NULL;
        END;
      ELSE
        pred_numeros := jsonb_build_object('2', pred_record.numeros);
      END IF;
    ELSE
      CONTINUE;
    END IF;

    IF pred_numeros IS NULL THEN CONTINUE; END IF;

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
    pred_redoblona := pred_numeros->>'r';

    aciertos2_json := '[]'::JSONB;
    aciertos3_json := '[]'::JSONB;
    aciertos4_json := '[]'::JSONB;
    aciertos_red_json := '[]'::JSONB;
    unique_positions := '{}';

    FOR i IN 1..COALESCE(array_length(pred2_arr, 1), 0) LOOP
      pos := array_position(nums2, pred2_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred2_arr[i], 'puesto', pos);
        aciertos2_json := aciertos2_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    FOR i IN 1..COALESCE(array_length(pred3_arr, 1), 0) LOOP
      pos := array_position(nums3, pred3_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred3_arr[i], 'puesto', pos);
        aciertos3_json := aciertos3_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    FOR i IN 1..COALESCE(array_length(pred4_arr, 1), 0) LOOP
      pos := array_position(nums4, pred4_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred4_arr[i], 'puesto', pos);
        aciertos4_json := aciertos4_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    IF pred_redoblona IS NOT NULL AND pred_redoblona LIKE '%-%' THEN
      pred_cabeza      := split_part(pred_redoblona, '-', 1);
      pred_acompanante := split_part(pred_redoblona, '-', 2);
      red_cabeza_pos   := array_position(nums2, LPAD(pred_cabeza, 2, '0'));
      red_acomp_pos    := array_position(nums2, LPAD(pred_acompanante, 2, '0'));

      IF red_cabeza_pos IS NOT NULL AND red_acomp_pos IS NOT NULL THEN
        aciertos_red_json := jsonb_build_object(
          'cabeza', jsonb_build_object('numero', LPAD(pred_cabeza, 2, '0'), 'puesto', red_cabeza_pos),
          'acompanante', jsonb_build_object('numero', LPAD(pred_acompanante, 2, '0'), 'puesto', red_acomp_pos)
        );
        IF NOT red_cabeza_pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, red_cabeza_pos);
        END IF;
        IF NOT red_acomp_pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, red_acomp_pos);
        END IF;
      END IF;
    END IF;

    total_hits := jsonb_array_length(aciertos2_json)
                + jsonb_array_length(aciertos3_json)
                + jsonb_array_length(aciertos4_json)
                + CASE WHEN jsonb_array_length(aciertos_red_json) > 0 THEN 1 ELSE 0 END;

    UPDATE user_predictions
    SET status = CASE WHEN total_hits > 0 THEN 'WON' ELSE 'LOST' END,
        aciertos = unique_positions,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = pred_record.id;

    INSERT INTO prediction_history (
      prediction_id, user_id, date, turno,
      numeros_2, numeros_3, numeros_4,
      resultado_oficial,
      aciertos_2, aciertos_3, aciertos_4,
      total_aciertos, verified, verified_at, game_id,
      redoblonas, aciertos_redoblona
    ) VALUES (
      pred_record.id, pred_record.user_id, NEW.date, NEW.turno,
      pred2_arr, pred3_arr, pred4_arr,
      to_jsonb(NEW.numbers),
      aciertos2_json, aciertos3_json, aciertos4_json,
      total_hits, true, NOW(), NEW.game_id,
      CASE WHEN pred_redoblona IS NOT NULL
           THEN jsonb_build_object('cabeza', split_part(pred_redoblona, '-', 1), 'acompanante', split_part(pred_redoblona, '-', 2))
           ELSE '[]'::JSONB END,
      aciertos_red_json
    )
    ON CONFLICT (prediction_id) DO UPDATE SET
      numeros_2 = EXCLUDED.numeros_2,
      numeros_3 = EXCLUDED.numeros_3,
      numeros_4 = EXCLUDED.numeros_4,
      aciertos_2 = EXCLUDED.aciertos_2,
      aciertos_3 = EXCLUDED.aciertos_3,
      aciertos_4 = EXCLUDED.aciertos_4,
      total_aciertos = EXCLUDED.total_aciertos,
      resultado_oficial = EXCLUDED.resultado_oficial,
      redoblonas = EXCLUDED.redoblonas,
      aciertos_redoblona = EXCLUDED.aciertos_redoblona,
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
END $func$;
