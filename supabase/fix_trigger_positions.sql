-- =============================================================
-- FASE 1: Fix Trigger de Verificación — Posiciones 1-20
-- =============================================================
-- Ejecutar en Supabase SQL Editor
-- =============================================================

-- 1. Asegurar que prediction_history.aciertos_2/3/4 sean JSONB
DO $$
BEGIN
  -- Si las columnas son TEXT[] o INT[], convertir a JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'prediction_history' AND column_name = 'aciertos_2'
    AND data_type != 'jsonb'
  ) THEN
    ALTER TABLE prediction_history
      ALTER COLUMN aciertos_2 TYPE JSONB USING to_jsonb(aciertos_2),
      ALTER COLUMN aciertos_3 TYPE JSONB USING to_jsonb(aciertos_3),
      ALTER COLUMN aciertos_4 TYPE JSONB USING to_jsonb(aciertos_4);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Column type conversion skipped: %', SQLERRM;
END $$;


-- 2. Reemplazar la función del trigger
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
  idx            INT;
  positions_list INT[] := '{}';
BEGIN
  -- Guard: necesitamos al menos 5 números oficiales
  IF NEW.numbers IS NULL OR array_length(NEW.numbers, 1) < 5 THEN
    RETURN NEW;
  END IF;

  -- ── Construir arrays oficiales (2, 3 y 4 cifras) ──
  -- nums2: posición 1 = primer número del sorteo, posición 20 = vigésimo
  nums2 := ARRAY(SELECT LPAD(MOD(v, 100)::TEXT, 2, '0') FROM unnest(NEW.numbers) v);
  nums3 := ARRAY(SELECT LPAD(MOD(v, 1000)::TEXT, 3, '0') FROM unnest(NEW.numbers) v);
  nums4 := ARRAY(SELECT LPAD(v::TEXT, 4, '0') FROM unnest(NEW.numbers) v);

  -- ── Iterar predicciones PENDING para este turno/fecha ──
  FOR pred_record IN
    SELECT id, user_id, numeros
    FROM user_predictions
    WHERE date = NEW.date
      AND turno = NEW.turno
      AND status = 'PENDING'
  LOOP

    -- ── Parsear formato de predicción ──
    -- numeros can be TEXT[] (free) or JSONB text[] (premium)
    BEGIN
      pred_numeros := pred_record.numeros::JSONB;
    EXCEPTION WHEN OTHERS THEN
      -- text[] can't cast to JSONB directly, convert via to_jsonb
      pred_numeros := to_jsonb(pred_record.numeros);
    END;

    -- Formato premium: ["{\"2\":[...],\"3\":[...]}"] (text array con JSON string)
    IF jsonb_typeof(pred_numeros) = 'array'
       AND jsonb_array_length(pred_numeros) = 1
       AND jsonb_typeof(pred_numeros->0) = 'string'
    THEN
      BEGIN
        pred_numeros := (pred_numeros->>0)::JSONB;
      EXCEPTION WHEN OTHERS THEN
        NULL;  -- No es JSON válido, tratar como array plano
      END;
    END IF;

    -- Extraer predicciones por categoría
    IF jsonb_typeof(pred_numeros) = 'array' THEN
      -- Free: solo 2 cifras — elements are text directly
      pred2_arr := ARRAY(
        SELECT LPAD(v, 2, '0')
        FROM jsonb_array_elements_text(pred_numeros) v
      );
      pred3_arr := '{}';
      pred4_arr := '{}';
    ELSIF jsonb_typeof(pred_numeros) = 'object' THEN
      -- Premium: { "2": [...], "3": [...], "4": [...] }
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
      pred2_arr := '{}';
      pred3_arr := '{}';
      pred4_arr := '{}';
    END IF;

    -- ── matching 2 cifras con POSICIÓN (1-20) ──
    aciertos2_json := '[]'::JSONB;
    positions_list := '{}';
    FOR i IN 1..array_length(pred2_arr, 1) LOOP
      idx := array_position(nums2, pred2_arr[i]);
      IF idx IS NOT NULL THEN
        aciertos2_json := aciertos2_json || jsonb_build_object(
          'numero', pred2_arr[i],
          'puesto', idx
        );
        positions_list := array_append(positions_list, idx);
      END IF;
    END LOOP;

    -- ── matching 3 cifras con POSICIÓN (1-20) ──
    aciertos3_json := '[]'::JSONB;
    IF array_length(pred3_arr, 1) > 0 THEN
      FOR i IN 1..array_length(pred3_arr, 1) LOOP
        idx := array_position(nums3, pred3_arr[i]);
        IF idx IS NOT NULL THEN
          aciertos3_json := aciertos3_json || jsonb_build_object(
            'numero', pred3_arr[i],
            'puesto', idx
          );
          positions_list := array_append(positions_list, idx);
        END IF;
      END LOOP;
    END IF;

    -- ── matching 4 cifras con POSICIÓN (1-20) ──
    aciertos4_json := '[]'::JSONB;
    IF array_length(pred4_arr, 1) > 0 THEN
      FOR i IN 1..array_length(pred4_arr, 1) LOOP
        idx := array_position(nums4, pred4_arr[i]);
        IF idx IS NOT NULL THEN
          aciertos4_json := aciertos4_json || jsonb_build_object(
            'numero', pred4_arr[i],
            'puesto', idx
          );
          positions_list := array_append(positions_list, idx);
        END IF;
      END LOOP;
    END IF;

    -- Total de aciertos
    total_hits := jsonb_array_length(aciertos2_json)
                + jsonb_array_length(aciertos3_json)
                + jsonb_array_length(aciertos4_json);

    -- ── Actualizar user_predictions ──
    -- aciertos = array de POSICIONES (1-20), NO de números predichos
    UPDATE user_predictions
    SET status      = CASE WHEN total_hits > 0 THEN 'WON' ELSE 'LOST' END,
        aciertos    = positions_list,
        verified_at = NOW(),
        updated_at  = NOW()
    WHERE id = pred_record.id;

    -- ── Insertar/actualizar prediction_history ──
    -- aciertos_2/3/4 = JSONB con { numero, puesto }
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
      aciertos_2       = EXCLUDED.aciertos_2,
      aciertos_3       = EXCLUDED.aciertos_3,
      aciertos_4       = EXCLUDED.aciertos_4,
      total_aciertos   = EXCLUDED.total_aciertos,
      resultado_oficial = EXCLUDED.resultado_oficial,
      verified         = true,
      verified_at      = NOW();

    -- ── Actualizar user_stats ──
    INSERT INTO user_stats (
      user_id, total_predictions, total_hits,
      current_streak, best_streak, last_verified
    ) VALUES (
      pred_record.user_id, 1, total_hits,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_predictions = user_stats.total_predictions + 1,
      total_hits        = user_stats.total_hits + EXCLUDED.total_hits,
      current_streak    = CASE
                            WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1
                            ELSE 0
                          END,
      best_streak       = GREATEST(
                            user_stats.best_streak,
                            CASE
                              WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1
                              ELSE 0
                            END
                          ),
      last_verified     = NOW();

  END LOOP;

  RETURN NEW;
END $$;


-- 3. Recrear el trigger (por si acaso)
DROP TRIGGER IF EXISTS trg_verify_predictions ON draws;
CREATE TRIGGER trg_verify_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION verify_predictions_on_draw_insert();


-- =============================================================
-- VERIFICACIÓN: Test rápido
-- =============================================================
-- Ejecutar DESPUÉS de aplicar el script anterior
-- =============================================================
DO $$
DECLARE
  test_pred_id UUID;
  test_user_id UUID := '00000000-0000-0000-0000-000000000001';
  test_date    DATE := '2099-01-15';
  test_turno   TEXT := 'Nocturna';
  official     INT[] := ARRAY[1234, 5678, 9012, 3456, 7890, 1111, 2222, 3333, 4444, 5555,
                              6666, 7777, 8888, 9999, 1010, 2020, 3030, 4040, 5050, 6060];
  result_status TEXT;
  result_aciertos INT[];
  hist_aciertos_2 JSONB;
BEGIN
  -- Insertar predicción de prueba (2 cifras: "34" está en posición 1, "99" no existe)
  INSERT INTO user_predictions (user_id, date, turno, numeros, game_id, status)
  VALUES (test_user_id, test_date, test_turno,
          ARRAY['34', '99', '12'],
          'ac593199-c299-4f03-b1b7-8675fe4fa6d9',
          'PENDING')
  RETURNING id INTO test_pred_id;

  -- Insertar sorteo (dispara el trigger)
  INSERT INTO draws (date, turno, numbers, game_id, source)
  VALUES (test_date, test_turno, official,
          'ac593199-c299-4f03-b1b7-8675fe4fa6d9',
          'test');

  -- Verificar resultados
  SELECT status, aciertos INTO result_status, result_aciertos
  FROM user_predictions WHERE id = test_pred_id;

  SELECT aciertos_2 INTO hist_aciertos_2
  FROM prediction_history WHERE prediction_id = test_pred_id;

  RAISE NOTICE 'Status: %', result_status;
  RAISE NOTICE 'Aciertos (posiciones): %', result_aciertos;
  RAISE NOTICE 'History aciertos_2: %', hist_aciertos_2;

  -- Assertions
  IF result_status != 'WON' THEN
    RAISE EXCEPTION 'FAIL: Expected WON, got %', result_status;
  END IF;
  IF NOT (result_aciertos @> ARRAY[1]) THEN
    RAISE EXCEPTION 'FAIL: Expected position 1 in aciertos, got %', result_aciertos;
  END IF;
  IF hist_aciertos_2 IS NULL OR jsonb_array_length(hist_aciertos_2) < 1 THEN
    RAISE EXCEPTION 'FAIL: Expected aciertos_2 to have entries';
  END IF;

  RAISE NOTICE '=== TEST PASSED ===';

  -- Cleanup
  DELETE FROM prediction_history WHERE prediction_id = test_pred_id;
  DELETE FROM user_predictions WHERE id = test_pred_id;
  DELETE FROM draws WHERE date = test_date AND turno = test_turno AND source = 'test';
  DELETE FROM user_stats WHERE user_id = test_user_id;
END $$;
