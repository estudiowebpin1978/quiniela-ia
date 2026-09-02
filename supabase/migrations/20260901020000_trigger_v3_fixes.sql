-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Trigger v3 — correct premium check + EXCEPTION block
-- ══════════════════════════════════════════════════════════════════════════════
-- Fixes from Gap Analysis:
--   FIX 3: Premium check — detect JSON via numeros[1] LIKE '{%' FIRST
--   FIX 5: EXCEPTION block — one bad prediction doesn't kill the entire turno

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
BEGIN
  -- Extract cabeza in all formats
  v_cabeza_2 := RIGHT(NEW.cabeza, 2);
  v_cabeza_3 := LPAD(NEW.cabeza, 3, '0');
  v_cabeza_4 := LPAD(NEW.cabeza, 4, '0');
  v_cabeza_int := NEW.cabeza::INTEGER;

  -- ══════════════════════════════════════════════════════════════════════════
  -- SET-BASED: Update all PENDING predictions for this fecha+turno
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── Step 1: Mark exact hits (WON) ──
  -- FIX 3: Detect JSON FIRST via numeros[1] LIKE '{%'
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
  RAISE NOTICE 'Step 1 (WON): % rows affected', v_affected;

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
  RAISE NOTICE 'Step 2 (NEAR_MISS): % rows affected', v_affected;

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
  RAISE NOTICE 'Step 3 (LOST): % rows affected', v_affected;

  -- ── Step 4: Insert prediction_history for all verified predictions ──
  INSERT INTO prediction_history (
    prediction_id, user_id, date, turno,
    numeros_2, resultado_oficial,
    aciertos_2, total_aciertos,
    verified, verified_at, game_id
  )
  SELECT
    up.id,
    up.user_id,
    up.date,
    up.turno,
    -- Extract 2-cifras numbers from polymorphic numeros
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'2'))
      ELSE up.numeros
    END,
    to_jsonb(NEW.premios_array),
    -- aciertos_2: {numero, puesto}
    CASE
      WHEN up.status = 'WON' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 1))
      WHEN up.status = 'NEAR_MISS' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 0))
      ELSE '[]'::jsonb
    END,
    -- total_aciertos
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
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
    -- FIX 5: Don't let one bad prediction kill the entire turno
    -- Log the error but still return NEW so the draw is saved
    RAISE WARNING 'verify_user_predictions_after_draw error for % %: %',
      NEW.date, NEW.turno, SQLERRM;
    RETURN NEW;
END;
$$;
