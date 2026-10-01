-- Add Poceada verification support to verify_predictions_for_draw
-- Poceada: 8 numbers drawn, user picks 8, wins with 5/6/7/8 matches

CREATE OR REPLACE FUNCTION api.verify_predictions_for_draw(
  p_date DATE,
  p_turno TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draw_numbers INT[];
  v_cabeza_2 TEXT;
  v_cabeza_3 TEXT;
  v_cabeza_4 TEXT;
  v_cabeza_int INT;
  v_near_plus TEXT;
  v_near_minus TEXT;
  v_is_json BOOLEAN;
  v_is_poceada BOOLEAN;
  v_oficial_2 TEXT[];
  v_oficial_3 TEXT[];
  v_oficial_4 TEXT[];
  v_redoblona_cabeza TEXT;
  v_redoblona_acompanante TEXT;
  v_won INT := 0;
  v_near INT := 0;
  v_lost INT := 0;
  v_3c_hits INT := 0;
  v_4c_hits INT := 0;
  v_redoblona_hits INT := 0;
  v_poceada_hits INT := 0;
BEGIN
  -- Get the official draw numbers
  SELECT d.numbers INTO v_draw_numbers
  FROM draws d
  WHERE d.date = p_date AND d.turno = p_turno
    AND d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) >= 1
  ORDER BY d.created_at DESC LIMIT 1;

  IF NOT FOUND OR v_draw_numbers IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No draw found');
  END IF;

  -- Detect if this is Poceada (8 numbers, game_id check)
  v_is_poceada := p_turno = 'Poceada' OR EXISTS (
    SELECT 1 FROM draws d
    WHERE d.date = p_date AND d.turno = p_turno
      AND d.game_id = 'd0e1f2a3-b4c5-6789-0abc-def012345678'
  );

  -- Extract cabeza in all formats
  v_cabeza_2 := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');
  v_cabeza_3 := LPAD(MOD(v_draw_numbers[1], 1000)::TEXT, 3, '0');
  v_cabeza_4 := LPAD(v_draw_numbers[1]::TEXT, 4, '0');
  v_cabeza_int := v_draw_numbers[1];
  v_near_plus := LPAD(MOD(v_draw_numbers[1] + 1, 100)::TEXT, 2, '0');
  v_near_minus := LPAD(MOD(v_draw_numbers[1] - 1 + 100, 100)::TEXT, 2, '0');

  -- Build official 2C array
  v_oficial_2 := ARRAY(
    SELECT DISTINCT LPAD(MOD(n, 100)::TEXT, 2, '0')
    FROM unnest(v_draw_numbers) n
  );

  -- Build official 3C/4C arrays from all draw numbers
  v_oficial_3 := ARRAY(
    SELECT DISTINCT LPAD(MOD(n, 1000)::TEXT, 3, '0')
    FROM unnest(v_draw_numbers) n
  );
  v_oficial_4 := ARRAY(
    SELECT DISTINCT LPAD(n::TEXT, 4, '0')
    FROM unnest(v_draw_numbers) n
  );

  -- Redoblona: first two numbers
  IF array_length(v_draw_numbers, 1) >= 2 THEN
    v_redoblona_cabeza := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');
    v_redoblona_acompanante := LPAD(MOD(v_draw_numbers[2], 100)::TEXT, 2, '0');
  END IF;

  -- Detect if predictions use JSON format (premium)
  SELECT EXISTS (
    SELECT 1 FROM user_predictions
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND array_length(numeros, 1) > 0 AND numeros[1] LIKE '{%'
  ) INTO v_is_json;

  -- ══════════════════════════════════════════════════════════════
  -- POCEADA: Count matching numbers (5/6/7/8 wins)
  -- ══════════════════════════════════════════════════════════════
  IF v_is_poceada THEN
    -- For Poceada, count how many of user's 8 numbers appear in draw's 8 numbers
    IF v_is_json THEN
      UPDATE user_predictions
      SET status = 'WON',
          aciertos = ARRAY[
            (SELECT count(*)::int FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') pred
             WHERE pred = ANY(v_oficial_2))
          ],
          verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') pred
          WHERE pred = ANY(v_oficial_2)
        )
        AND (
          SELECT count(*) FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') pred
          WHERE pred = ANY(v_oficial_2)
        ) >= 5;
    ELSE
      UPDATE user_predictions
      SET status = 'WON',
          aciertos = ARRAY[
            (SELECT count(*)::int FROM unnest(numeros) pred
             WHERE pred = ANY(v_oficial_2))
          ],
          verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND EXISTS (
          SELECT 1 FROM unnest(numeros) pred
          WHERE pred = ANY(v_oficial_2)
        )
        AND (
          SELECT count(*) FROM unnest(numeros) pred
          WHERE pred = ANY(v_oficial_2)
        ) >= 5;
    END IF;
    GET DIAGNOSTICS v_won = ROW_COUNT;

    -- Mark remaining as LOST
    UPDATE user_predictions SET status = 'LOST', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING';
    GET DIAGNOSTICS v_lost = ROW_COUNT;

    RETURN jsonb_build_object(
      'ok', true,
      'poceada', true,
      'won', v_won,
      'lost', v_lost
    );
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- NACIONAL: Standard verification (cabeza match, near miss, 3C, 4C, redoblona)
  -- ══════════════════════════════════════════════════════════════

  -- STEP 1: Mark WON (exact 2C match)
  IF v_is_json THEN
    UPDATE user_predictions SET status = 'WON', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND v_cabeza_2 IN (
        SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2')
      );
  ELSE
    UPDATE user_predictions SET status = 'WON', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND v_cabeza_2 = ANY(numeros);
  END IF;
  GET DIAGNOSTICS v_won = ROW_COUNT;

  -- STEP 2: Mark NEAR_MISS (±1 from cabeza)
  IF v_is_json THEN
    UPDATE user_predictions SET status = 'NEAR_MISS', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') n
        WHERE n = v_near_plus OR n = v_near_minus
      );
  ELSE
    UPDATE user_predictions SET status = 'NEAR_MISS', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND EXISTS (
        SELECT 1 FROM unnest(numeros) n
        WHERE n = v_near_plus OR n = v_near_minus
      );
  END IF;
  GET DIAGNOSTICS v_near = ROW_COUNT;

  -- STEP 3: Mark 3C hits
  IF v_is_json THEN
    UPDATE user_predictions
    SET aciertos = COALESCE(aciertos, '{}') || ARRAY[3],
        verified_at = NOW()
    WHERE date = p_date AND turno = p_turno
      AND status IN ('WON', 'PENDING')
      AND numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'3') pred3
        WHERE pred3 = ANY(v_oficial_3)
      );
    GET DIAGNOSTICS v_3c_hits = ROW_COUNT;
  END IF;

  -- STEP 4: Mark 4C hits
  IF v_is_json THEN
    UPDATE user_predictions
    SET aciertos = COALESCE(aciertos, '{}') || ARRAY[4],
        verified_at = NOW()
    WHERE date = p_date AND turno = p_turno
      AND status IN ('WON', 'PENDING')
      AND numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'4') pred4
        WHERE pred4 = ANY(v_oficial_4)
      );
    GET DIAGNOSTICS v_4c_hits = ROW_COUNT;
  END IF;

  -- STEP 5: Mark redoblona hits
  IF v_is_json THEN
    UPDATE user_predictions
    SET aciertos = COALESCE(aciertos, '{}') || ARRAY[5],
        verified_at = NOW()
    WHERE date = p_date AND turno = p_turno
      AND status IN ('WON', 'PENDING')
      AND numeros[1] IS NOT NULL AND numeros[1] LIKE '{%'
      AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'r') rb
        WHERE rb = v_redoblona_cabeza || '-' || v_redoblona_acompanante
           OR rb = v_redoblona_acompanante || '-' || v_redoblona_cabeza
      );
    GET DIAGNOSTICS v_redoblona_hits = ROW_COUNT;
  END IF;

  -- STEP 6: Mark remaining as LOST
  UPDATE user_predictions SET status = 'LOST', verified_at = NOW()
  WHERE date = p_date AND turno = p_turno AND status = 'PENDING';
  GET DIAGNOSTICS v_lost = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'won', v_won,
    'near_miss', v_near,
    'lost', v_lost,
    '3c_hits', v_3c_hits,
    '4c_hits', v_4c_hits,
    'redoblona_hits', v_redoblona_hits
  );
END;
$$;
