CREATE OR REPLACE FUNCTION api.save_draw_and_verify(
  p_date DATE, p_turno TEXT, p_numbers INT[], p_source TEXT, p_game_id UUID, p_jurisdiccion TEXT DEFAULT 'nacional'
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_draw_id UUID; v_cabeza TEXT; v_won INT := 0; v_near INT := 0; v_lost INT := 0;
  v_near_plus TEXT; v_near_minus TEXT; v_is_json BOOLEAN; v_existed BOOLEAN := FALSE;
BEGIN
  INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion)
  VALUES (p_date, p_turno, p_numbers, p_source, p_game_id, p_jurisdiccion)
  ON CONFLICT (date, turno, game_id) DO UPDATE SET numbers = EXCLUDED.numbers, source = EXCLUDED.source, updated_at = NOW()
  RETURNING id INTO v_draw_id;

  SELECT EXISTS (SELECT 1 FROM draws WHERE date = p_date AND turno = p_turno AND game_id = p_game_id) INTO v_existed;

  IF array_length(p_numbers, 1) >= 1 THEN
    v_cabeza := LPAD(MOD(p_numbers[1], 100)::TEXT, 2, '0');
    v_near_plus := LPAD(MOD(p_numbers[1] + 1, 100)::TEXT, 2, '0');
    v_near_minus := LPAD(MOD(p_numbers[1] - 1 + 100, 100)::TEXT, 2, '0');

    SELECT EXISTS (
      SELECT 1 FROM user_predictions WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND array_length(numeros, 1) > 0 AND numeros[1] LIKE '{%'
    ) INTO v_is_json;

    IF v_is_json THEN
      UPDATE user_predictions SET status = 'WON', verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND v_cabeza IN (SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2'));
    ELSE
      UPDATE user_predictions SET status = 'WON', verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING' AND v_cabeza = ANY(numeros);
    END IF;
    GET DIAGNOSTICS v_won = ROW_COUNT;

    IF v_is_json THEN
      UPDATE user_predictions SET status = 'NEAR_MISS', verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') n WHERE n = v_near_plus OR n = v_near_minus);
    ELSE
      UPDATE user_predictions SET status = 'NEAR_MISS', verified_at = NOW()
      WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
        AND EXISTS (SELECT 1 FROM unnest(numeros) n WHERE n = v_near_plus OR n = v_near_minus);
    END IF;
    GET DIAGNOSTICS v_near = ROW_COUNT;

    UPDATE user_predictions SET status = 'LOST', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING';
    GET DIAGNOSTICS v_lost = ROW_COUNT;
  END IF;

  PERFORM refresh_cached_predictions_3_4(p_turno);

  RETURN jsonb_build_object('ok', true, 'draw_id', v_draw_id, 'existed', v_existed, 'cabeza', v_cabeza, 'won', v_won, 'near_miss', v_near, 'lost', v_lost);
END;
";

GRANT EXECUTE ON FUNCTION api.save_draw_and_verify(DATE, TEXT, INT[], TEXT, UUID, TEXT) TO service_role;
