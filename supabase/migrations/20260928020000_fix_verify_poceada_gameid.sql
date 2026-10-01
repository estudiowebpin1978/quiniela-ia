-- Fix: verify_predictions_for_draw comparaba draws.game_id (uuid) contra el
-- literal de texto 'poceada-lotba-city-2026' → "invalid input syntax for type
-- uuid" en cada verificación de turnos quiniela (cron-scrape, cron-run,
-- mis-predicciones). Se reemplaza por el uuid real del juego Poceada.

CREATE OR REPLACE FUNCTION api.verify_predictions_for_draw(p_date date, p_turno text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
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
  SELECT d.numbers INTO v_draw_numbers
  FROM draws d
  WHERE d.date = p_date AND d.turno = p_turno
    AND d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) >= 1
  ORDER BY d.created_at DESC LIMIT 1;

  IF NOT FOUND OR v_draw_numbers IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No draw found');
  END IF;

  v_is_poceada := p_turno = 'Poceada' OR EXISTS (
    SELECT 1 FROM draws d
    WHERE d.date = p_date AND d.turno = p_turno
      AND d.game_id = 'd0e1f2a3-b4c5-6789-0abc-def012345678'
  );

  v_cabeza_2 := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');
  v_cabeza_3 := LPAD(MOD(v_draw_numbers[1], 1000)::TEXT, 3, '0');
  v_cabeza_4 := LPAD(v_draw_numbers[1]::TEXT, 4, '0');
  v_cabeza_int := v_draw_numbers[1];
  v_near_plus := LPAD(MOD(v_draw_numbers[1] + 1, 100)::TEXT, 2, '0');
  v_near_minus := LPAD(MOD(v_draw_numbers[1] - 1 + 100, 100)::TEXT, 2, '0');

  v_oficial_2 := ARRAY(
    SELECT DISTINCT LPAD(MOD(n, 100)::TEXT, 2, '0')
    FROM unnest(v_draw_numbers) n
  );

  v_oficial_3 := ARRAY(
    SELECT DISTINCT LPAD(MOD(n, 1000)::TEXT, 3, '0')
    FROM unnest(v_draw_numbers) n
  );

  v_oficial_4 := ARRAY(
    SELECT DISTINCT LPAD(n::TEXT, 4, '0')
    FROM unnest(v_draw_numbers) n
  );

  IF array_length(v_draw_numbers, 1) >= 2 THEN
    v_redoblona_cabeza := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');
    v_redoblona_acompanante := LPAD(MOD(v_draw_numbers[2], 100)::TEXT, 2, '0');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_predictions
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND array_length(numeros, 1) > 0 AND numeros[1] LIKE '{%'
  ) INTO v_is_json;

  IF v_is_poceada THEN
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
$function$;
