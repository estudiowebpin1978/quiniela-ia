-- ============================================================================
-- SMOKE TEST E2E — QUINIELA IA
-- Ejecutar en: Supabase SQL Editor
-- Versión: 2026-08-14
-- ============================================================================

-- ============================================================================
-- CONFIGURACIÓN
-- ============================================================================
DO $$
DECLARE
  GAME_ID CONSTANT UUID := 'ac593199-c299-4f03-b1b7-8675fe4fa6d9';
  TEST_USER CONSTANT UUID := 'db3f6c66-87f8-4e09-9e7a-bdcfeea42f47'; -- estudiowebpin
  TEST_DATE CONSTANT DATE := '2026-12-31';  -- Fecha ficticia para no interferir con datos reales
  TEST_TURNO CONSTANT TEXT := 'Primera';
  PASS_COUNT INT := 0;
  FAIL_COUNT INT := 0;
  TEST_RESULT TEXT;
BEGIN
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'QUINIELA IA — SMOKE TEST E2E';
  RAISE NOTICE '============================================================';

  -- ============================================================================
  -- TEST 1: Normalización de estados (PENDING/WON/LOST)
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 1: Status Constraints ---';

  -- 1a: Verificar que solo acepta valores válidos
  BEGIN
    INSERT INTO user_predictions (user_id, date, turno, numeros, game_id, status)
    VALUES (TEST_USER, TEST_DATE, TEST_TURNO, ARRAY['11','22','33'], GAME_ID, 'INVALID');
    RAISE NOTICE 'TEST 1a: FAIL — Status inválido aceptado';
    FAIL_COUNT := FAIL_COUNT + 1;
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'TEST 1a: PASS — Status inválido rechazado (CHECK constraint)';
    PASS_COUNT := PASS_COUNT + 1;
  END;

  -- 1b: Verificar que acepta PENDING
  BEGIN
    INSERT INTO user_predictions (user_id, date, turno, numeros, game_id, status)
    VALUES (TEST_USER, TEST_DATE, TEST_TURNO, ARRAY['11','22','33'], GAME_ID, 'PENDING');
    RAISE NOTICE 'TEST 1b: PASS — Status PENDING aceptado';
    PASS_COUNT := PASS_COUNT + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 1b: FAIL — Status PENDING rechazado: %', SQLERRM;
    FAIL_COUNT := FAIL_COUNT + 1;
  END;

  -- 1c: Verificar que acepta WON
  BEGIN
    UPDATE user_predictions SET status = 'WON'
    WHERE date = TEST_DATE AND turno = TEST_TURNO AND user_id = TEST_USER;
    GET DIAGNOSTICS TEST_RESULT = ROW_COUNT;
    IF TEST_RESULT::INT > 0 THEN
      RAISE NOTICE 'TEST 1c: PASS — Status WON aceptado';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 1c: FAIL — No se pudo actualizar a WON';
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- 1d: Verificar que acepta LOST
  BEGIN
    UPDATE user_predictions SET status = 'LOST'
    WHERE date = TEST_DATE AND turno = TEST_TURNO AND user_id = TEST_USER;
    RAISE NOTICE 'TEST 1d: PASS — Status LOST aceptado';
    PASS_COUNT := PASS_COUNT + 1;
  END;

  -- Reset
  UPDATE user_predictions SET status = 'PENDING'
  WHERE date = TEST_DATE AND turno = TEST_TURNO AND user_id = TEST_USER;

  -- ============================================================================
  -- TEST 2: Trigger verify_predictions_on_draw_insert
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 2: Trigger verify_predictions_on_draw_insert ---';

  -- 2a: Insertar predicción PENDING con números conocidos
  INSERT INTO user_predictions (user_id, date, turno, numeros, game_id, status)
  VALUES (TEST_USER, TEST_DATE, TEST_TURNO, ARRAY['45','67','12','89','34','56','78','90','23','01'], GAME_ID, 'PENDING')
  ON CONFLICT DO NOTHING;

  -- 2b: Insertar draw que debería disparar el trigger
  -- Numbers: [10045, 20067, 30012, 40089, 50034, 60056, 70078, 80090, 90023, 10001]
  -- Últimos 2 dígitos: 45, 67, 12, 89, 34, 56, 78, 90, 23, 01 → TODOS matchean
  INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion)
  VALUES (TEST_DATE, TEST_TURNO, ARRAY[10045, 20067, 30012, 40089, 50034, 60056, 70078, 80090, 90023, 10001, 11111, 22222, 33333, 44444, 55555, 66666, 77777, 88888, 99999, 12345]::INT[], 'smoke_test', GAME_ID, 'nacional')
  ON CONFLICT (date, turno, game_id) DO UPDATE SET numbers = EXCLUDED.numbers, source = EXCLUDED.source;

  -- 2c: Verificar que el trigger actualizó el status
  DECLARE
    v_status TEXT;
    v_aciertos INT[];
  BEGIN
    SELECT status, aciertos INTO v_status, v_aciertos
    FROM user_predictions
    WHERE date = TEST_DATE AND turno = TEST_TURNO AND user_id = TEST_USER AND status != 'PENDING'
    ORDER BY created_at DESC LIMIT 1;

    IF v_status = 'WON' THEN
      RAISE NOTICE 'TEST 2a: PASS — Trigger cambió status a WON';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 2a: FAIL — Status esperado WON, actual: %', v_status;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;

    IF v_aciertos IS NOT NULL AND array_length(v_aciertos, 1) > 0 THEN
      RAISE NOTICE 'TEST 2b: PASS — Trigger populate aciertos (%%): %', array_length(v_aciertos, 1);
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 2b: FAIL — aciertos vacío';
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- 2d: Verificar que prediction_history se insertó
  DECLARE
    v_history_count INT;
  BEGIN
    SELECT count(*) INTO v_history_count
    FROM prediction_history
    WHERE date = TEST_DATE AND turno = TEST_TURNO AND game_id = GAME_ID;

    IF v_history_count > 0 THEN
      RAISE NOTICE 'TEST 2c: PASS — prediction_history insertado (%%): % registros', v_history_count;
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 2c: FAIL — prediction_history vacío';
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- 2e: Verificar predicción sin match → status LOST
  INSERT INTO user_predictions (user_id, date, turno, numeros, game_id, status)
  VALUES (TEST_USER, TEST_DATE, TEST_TURNO, ARRAY['99','88','77','66','55','44','33','22','11','00'], GAME_ID, 'PENDING')
  ON CONFLICT DO NOTHING;

  INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion)
  VALUES (TEST_DATE, 'Matutina', ARRAY[10001, 20002, 30003, 40004, 50005, 60006, 70007, 80008, 90009, 10010, 11111, 22222, 33333, 44444, 55555, 66666, 77777, 88888, 99999, 12345]::INT[], 'smoke_test', GAME_ID, 'nacional')
  ON CONFLICT (date, turno, game_id) DO UPDATE SET numbers = EXCLUDED.numbers;

  DECLARE
    v_lost_status TEXT;
  BEGIN
    SELECT status INTO v_lost_status
    FROM user_predictions
    WHERE date = TEST_DATE AND turno = 'Matutina' AND user_id = TEST_USER;

    IF v_lost_status = 'LOST' THEN
      RAISE NOTICE 'TEST 2d: PASS — Predicción sin match → LOST';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 2d: FAIL — Status esperado LOST, actual: %', v_lost_status;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- ============================================================================
  -- TEST 3: RPC calculate_omega_v5 performance
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 3: RPC calculate_omega_v5 Performance ---';

  DECLARE
    v_start TIMESTAMP;
    v_end TIMESTAMP;
    v_ms INT;
    v_rows INT;
  BEGIN
    v_start := clock_timestamp();
    PERFORM calculate_omega_v5('Primera', 'free', CURRENT_DATE);
    v_end := clock_timestamp();
    v_ms := EXTRACT(MILLISECONDS FROM (v_end - v_start))::INT;

    SELECT count(*) INTO v_rows FROM calculate_omega_v5('Primera', 'free', CURRENT_DATE);

    IF v_ms < 2000 THEN
      RAISE NOTICE 'TEST 3a: PASS — RPC ejecutado en %% ms (< 2000ms)', v_ms;
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 3a: FAIL — RPC tomó %% ms (> 2000ms)', v_ms;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;

    IF v_rows = 10 THEN
      RAISE NOTICE 'TEST 3b: PASS — RPC retorna 10 filas';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 3b: FAIL — RPC retornó %% filas (esperado 10)', v_rows;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- Premium tier
  DECLARE
    v_prem_rows INT;
  BEGIN
    SELECT count(*) INTO v_prem_rows FROM calculate_omega_v5('Primera', 'premium', CURRENT_DATE);

    IF v_prem_rows = 10 THEN
      RAISE NOTICE 'TEST 3c: PASS — Premium RPC retorna 10 filas';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 3c: FAIL — Premium RPC retornó %% filas', v_prem_rows;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- ============================================================================
  -- TEST 4: No duplicados al reinsertar draw
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 4: Dedup Draws ---';

  DECLARE
    v_count_before INT;
    v_count_after INT;
  BEGIN
    SELECT count(*) INTO v_count_before FROM draws
    WHERE date = TEST_DATE AND turno = 'Matutina' AND game_id = GAME_ID;

    -- Reinsertar mismo draw
    INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion)
    VALUES (TEST_DATE, 'Matutina', ARRAY[99999, 88888]::INT[], 'smoke_test_dup', GAME_ID, 'nacional')
    ON CONFLICT (date, turno, game_id) DO UPDATE SET source = EXCLUDED.source;

    SELECT count(*) INTO v_count_after FROM draws
    WHERE date = TEST_DATE AND turno = 'Matutina' AND game_id = GAME_ID;

    IF v_count_before = v_count_after THEN
      RAISE NOTICE 'TEST 4a: PASS — Sin duplicados (%% → %% registros)', v_count_before, v_count_after;
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 4a: FAIL — Duplicados detectados (%% → %% registros)', v_count_before, v_count_after;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- ============================================================================
  -- TEST 5: upsert_draw RPC (type-safe)
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 5: upsert_draw RPC ---';

  BEGIN
    PERFORM upsert_draw(
      TEST_DATE,
      'Vespertina',
      ARRAY[11111,22222,33333,44444,55555,66666,77777,88888,99999,12345,23456,34567,45678,56789,67890,78901,89012,90123,10001,20002]::INT[],
      'smoke_test_rpc',
      GAME_ID,
      'nacional'
    );
    RAISE NOTICE 'TEST 5a: PASS — upsert_draw ejecutado sin error';
    PASS_COUNT := PASS_COUNT + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 5a: FAIL — upsert_draw error: %', SQLERRM;
    FAIL_COUNT := FAIL_COUNT + 1;
  END;

  -- Verificar que el draw se insertó
  DECLARE
    v_exists BOOLEAN;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM draws WHERE date = TEST_DATE AND turno = 'Vespertina' AND game_id = GAME_ID) INTO v_exists;
    IF v_exists THEN
      RAISE NOTICE 'TEST 5b: PASS — upsert_draw guardó el draw';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 5b: FAIL — upsert_draw no guardó el draw';
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- Reinsertar para probar ON CONFLICT
  BEGIN
    PERFORM upsert_draw(
      TEST_DATE, 'Vespertina',
      ARRAY[99999]::INT[], 'smoke_test_rpc_dup', GAME_ID, 'nacional'
    );
    RAISE NOTICE 'TEST 5c: PASS — upsert_draw ON CONFLICT sin error';
    PASS_COUNT := PASS_COUNT + 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST 5c: FAIL — upsert_draw ON CONFLICT error: %', SQLERRM;
    FAIL_COUNT := FAIL_COUNT + 1;
  END;

  -- ============================================================================
  -- TEST 6: activate_premium RPC
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- TEST 6: activate_premium RPC ---';

  DECLARE
    v_rol TEXT;
    v_until TIMESTAMPTZ;
  BEGIN
    PERFORM activate_premium('SMOKE_TEST_TX_001', TEST_USER, 30);

    SELECT role, premium_until INTO v_rol, v_until
    FROM user_profiles WHERE id = TEST_USER;

    IF v_rol = 'premium' THEN
      RAISE NOTICE 'TEST 6a: PASS — activate_premium set role=premium';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 6a: FAIL — role esperado premium, actual: %', v_rol;
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;

    IF v_until > NOW() THEN
      RAISE NOTICE 'TEST 6b: PASS — premium_until en futuro';
      PASS_COUNT := PASS_COUNT + 1;
    ELSE
      RAISE NOTICE 'TEST 6b: FAIL — premium_until no está en futuro';
      FAIL_COUNT := FAIL_COUNT + 1;
    END IF;
  END;

  -- ============================================================================
  -- LIMPIEZA
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '--- CLEANUP ---';

  DELETE FROM draws WHERE source LIKE 'smoke_test%' AND date = TEST_DATE;
  DELETE FROM user_predictions WHERE date = TEST_DATE AND user_id = TEST_USER;
  DELETE FROM prediction_history WHERE date = TEST_DATE AND game_id = GAME_ID;

  -- Restaurar tier original
  UPDATE user_profiles SET role = 'free', premium_until = NULL, uala_tx_id = NULL
  WHERE id = TEST_USER AND uala_tx_id = 'SMOKE_TEST_TX_001';

  RAISE NOTICE 'Cleanup completado.';

  -- ============================================================================
  -- RESUMEN
  -- ============================================================================
  RAISE NOTICE '';
  RAISE NOTICE '============================================================';
  RAISE NOTICE 'RESUMEN: %% PASS / %% FAIL / %% TOTAL', PASS_COUNT, FAIL_COUNT, PASS_COUNT + FAIL_COUNT;
  RAISE NOTICE '============================================================';

  IF FAIL_COUNT > 0 THEN
    RAISE WARNING 'ALGUNAS PRUEBAS FALLARON — revisar logs arriba';
  ELSE
    RAISE NOTICE 'TODAS LAS PRUEBAS PASARON ✓';
  END IF;
END $$;
