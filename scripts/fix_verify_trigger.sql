CREATE OR REPLACE FUNCTION verify_predictions_on_draw_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  pred_record      RECORD;
  nums2            TEXT[];
  nums3            TEXT[];
  nums4            TEXT[];
  pred2_arr        TEXT[];
  pred3_arr        TEXT[];
  pred4_arr        TEXT[];
  pred_redoblona   TEXT;
  aciertos2_json   JSONB := '[]'::JSONB;
  aciertos3_json   JSONB := '[]'::JSONB;
  aciertos4_json   JSONB := '[]'::JSONB;
  total_hits       INT;
  pred_numeros     JSONB;
  i                INT;
  hit_rec          JSONB;
  unique_positions INT[] := '{}';
  pos              INT;
  aciertos_pos     INT[] := '{}';
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
      pred_numeros := to_jsonb(pred_record.numeros);
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

    aciertos2_json := '[]'::JSONB;
    aciertos3_json := '[]'::JSONB;
    aciertos4_json := '[]'::JSONB;
    unique_positions := '{}';
    aciertos_pos := '{}';

    FOR i IN 1..COALESCE(array_length(pred2_arr, 1), 0) LOOP
      pos := array_position(nums2, pred2_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred2_arr[i], 'puesto', pos);
        aciertos2_json := aciertos2_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
          aciertos_pos := array_append(aciertos_pos, pos);
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
          aciertos_pos := array_append(aciertos_pos, pos);
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
          aciertos_pos := array_append(aciertos_pos, pos);
        END IF;
      END IF;
    END LOOP;

    total_hits := jsonb_array_length(aciertos2_json) + jsonb_array_length(aciertos3_json) + jsonb_array_length(aciertos4_json);

    UPDATE user_predictions
    SET status = CASE WHEN total_hits > 0 THEN 'WON' ELSE 'LOST' END,
        aciertos = aciertos_pos,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = pred_record.id;

    INSERT INTO prediction_history (
      user_id, date, turno, numeros_2, numeros_3, numeros_4,
      resultado_oficial, aciertos_2, aciertos_3, aciertos_4,
      total_aciertos, verified, verified_at, prediction_id, game_id,
      redoblonas, aciertos_redoblona
    ) VALUES (
      pred_record.user_id, NEW.date, NEW.turno,
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(pred_numeros->'2', '[]'::JSONB))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(pred_numeros->'3', '[]'::JSONB))),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(pred_numeros->'4', '[]'::JSONB))),
      to_jsonb(NEW.numbers),
      aciertos2_json, aciertos3_json, aciertos4_json,
      total_hits, true, NOW(), pred_record.id, NEW.game_id,
      '[]'::JSONB, '[]'::JSONB
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
