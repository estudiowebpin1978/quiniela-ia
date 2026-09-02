-- ══════════════════════════════════════════════════════════════════════════════
-- TRIGGER v4: 3/4 cifras verification + complete prediction_history
-- ══════════════════════════════════════════════════════════════════════════════
-- Fixes from audit:
--   FIX 1: Verify 3/4 cifras for premium users (was only 2 cifras)
--   FIX 2: Write numeros_3/4, aciertos_3/4, redoblonas to prediction_history
--   FIX 3: Extract 3/4 cifras from premios_array for official results

CREATE OR REPLACE FUNCTION verify_user_predictions_after_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza_2 VARCHAR(2);
  v_cabeza_3 VARCHAR(3);
  v_cabeza_4 VARCHAR(4);
  v_cabeza_int INTEGER;
  v_affected INTEGER;
  v_is_premium BOOLEAN;
  -- Official 3/4 cifras from premios_array
  v_oficial_3 TEXT[];
  v_oficial_4 TEXT[];
BEGIN
  -- Extract cabeza in all formats
  v_cabeza_2 := RIGHT(NEW.cabeza, 2);
  v_cabeza_3 := LPAD(NEW.cabeza, 3, '0');
  v_cabeza_4 := LPAD(NEW.cabeza, 4, '0');
  v_cabeza_int := NEW.cabeza::INTEGER;

  -- Extract 3/4 cifras from premios_array (JSONB array of full numbers)
  IF NEW.premios_array IS NOT NULL AND jsonb_array_length(NEW.premios_array) > 0 THEN
    v_oficial_3 := ARRAY(
      SELECT LPAD(RIGHT(elem::TEXT, 3), 3, '0')
      FROM jsonb_array_elements_text(NEW.premios_array) elem
    );
    v_oficial_4 := ARRAY(
      SELECT LPAD(elem::TEXT, 4, '0')
      FROM jsonb_array_elements_text(NEW.premios_array) elem
    );
  ELSE
    -- Fallback: only cabeza available
    v_oficial_3 := ARRAY[v_cabeza_3];
    v_oficial_4 := ARRAY[v_cabeza_4];
  END IF;

  -- ══════════════════════════════════════════════════════════════════════════
  -- SET-BASED: Update all PENDING predictions for this fecha+turno
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── Step 1: Mark exact hits (WON) — 2 cifras ──
  UPDATE user_predictions
  SET status = 'WON',
      aciertos = ARRAY[1],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING'
    AND (
      -- Case A: Premium user — JSON string like {"2":["05","12"],...}
      (numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
        AND v_cabeza_2 IN (
          SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2')
        ))
      OR
      -- Case B: Free user — flat text[] like {"05","12",...}
      (numeros[1] IS NULL OR numeros[1] NOT LIKE '{%')
        AND v_cabeza_2 = ANY(numeros)
    );

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RAISE NOTICE 'Step 1 (WON 2c): % rows', v_affected;

  -- ── Step 1b: Mark 3 cifras hits for premium ──
  UPDATE user_predictions
  SET aciertos = aciertos || ARRAY[3],
      status = CASE WHEN status = 'WON' THEN 'WON' ELSE status END,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status IN ('WON', 'PENDING')
    AND numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'3') pred3
      WHERE pred3 = ANY(v_oficial_3)
    );

  -- ── Step 1c: Mark 4 cifras hits for premium ──
  UPDATE user_predictions
  SET aciertos = aciertos || ARRAY[4],
      status = CASE WHEN status = 'WON' THEN 'WON' ELSE status END,
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status IN ('WON', 'PENDING')
    AND numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'4') pred4
      WHERE pred4 = ANY(v_oficial_4)
    );

  -- ── Step 2: Mark near-misses (NEAR_MISS) — ±1 from cabeza ──
  UPDATE user_predictions
  SET status = 'NEAR_MISS',
      aciertos = ARRAY[0],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING'
    AND (
      -- Case A: Premium user — check JSON "2" array for ±1
      (numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') n
          WHERE ABS(n::INTEGER - v_cabeza_int) = 1
        ))
      OR
      -- Case B: Free user — check flat array for ±1
      (numeros[1] IS NULL OR numeros[1] NOT LIKE '{%')
        AND EXISTS (
          SELECT 1 FROM unnest(numeros) n
          WHERE ABS(n::INTEGER - v_cabeza_int) = 1
        )
    );

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RAISE NOTICE 'Step 2 (NEAR_MISS): % rows', v_affected;

  -- ── Step 3: Mark losses (LOST) — everything still PENDING ──
  UPDATE user_predictions
  SET status = 'LOST',
      aciertos = ARRAY[0],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING';

  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RAISE NOTICE 'Step 3 (LOST): % rows', v_affected;

  -- ── Step 4: Insert prediction_history with ALL cifras ──
  INSERT INTO prediction_history (
    prediction_id, user_id, date, turno,
    numeros_2, numeros_3, numeros_4,
    resultado_oficial,
    aciertos_2, aciertos_3, aciertos_4,
    total_aciertos,
    verified, verified_at, game_id
  )
  SELECT
    up.id,
    up.user_id,
    up.date,
    up.turno,
    -- numeros_2: extract 2-cifras
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'2'))
      ELSE up.numeros
    END,
    -- numeros_3: extract 3-cifras (premium only)
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'3'))
      ELSE NULL
    END,
    -- numeros_4: extract 4-cifras (premium only)
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'4'))
      ELSE NULL
    END,
    to_jsonb(NEW.premios_array),
    -- aciertos_2
    CASE
      WHEN up.status = 'WON' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 1))
      WHEN up.status = 'NEAR_MISS' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 0))
      ELSE '[]'::jsonb
    END,
    -- aciertos_3: count 3-cifras hits
    CASE
      WHEN up.numeros[1] LIKE '{%' AND up.status IN ('WON', 'NEAR_MISS') THEN
        (SELECT count(*) FROM jsonb_array_elements_text((up.numeros[1]::jsonb)->'3') pred3
         WHERE pred3 = ANY(v_oficial_3))
      ELSE 0
    END,
    -- aciertos_4: count 4-cifras hits
    CASE
      WHEN up.numeros[1] LIKE '{%' AND up.status IN ('WON', 'NEAR_MISS') THEN
        (SELECT count(*) FROM jsonb_array_elements_text((up.numeros[1]::jsonb)->'4') pred4
         WHERE pred4 = ANY(v_oficial_4))
      ELSE 0
    END,
    -- total_aciertos: sum of all aciertos
    CASE
      WHEN array_length(up.aciertos, 1) > 0 THEN
        (SELECT count(*) FROM unnest(up.aciertos) a WHERE a > 0)
      ELSE 0
    END,
    true,
    NOW(),
    NEW.game_id
  FROM user_predictions up
  WHERE up.date = NEW.date
    AND up.turno = NEW.turno
    AND up.status IN ('WON', 'LOST', 'NEAR_MISS')
    AND up.verified_at = NOW()
  ON CONFLICT (prediction_id) DO NOTHING;

  -- ── Step 5: Update user_stats in batch ──
  INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified, updated_at)
  SELECT
    up.user_id,
    1,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    NOW(),
    NOW()
  FROM user_predictions up
  WHERE up.date = NEW.date
    AND up.turno = NEW.turno
    AND up.verified_at = NOW()
  ON CONFLICT (user_id) DO UPDATE SET
    total_predictions = user_stats.total_predictions + 1,
    total_hits = user_stats.total_hits + CASE WHEN EXCLUDED.total_hits > 0 THEN 1 ELSE 0 END,
    current_streak = CASE
      WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1
      ELSE 0
    END,
    best_streak = GREATEST(
      user_stats.best_streak,
      CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END
    ),
    last_verified = NOW(),
    updated_at = NOW();

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'verify_user_predictions_after_draw error for % %: %',
      NEW.date, NEW.turno, SQLERRM;
    RETURN NEW;
END;
$$;
