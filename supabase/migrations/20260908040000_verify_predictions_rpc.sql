-- Explicit verification RPC: verify_predictions_for_draw(p_date, p_turno)
-- Handles numeros format: text[] where numeros[1] is either a flat number
-- or a JSON string like {"2":["04","21",...]}

CREATE OR REPLACE FUNCTION api.verify_predictions_for_draw(
  p_date DATE,
  p_turno TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza TEXT;
  v_draw_numbers INT[];
  v_won INT := 0;
  v_near INT := 0;
  v_lost INT := 0;
  v_near_plus TEXT;
  v_near_minus TEXT;
  v_is_json BOOLEAN;
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

  v_cabeza := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');
  v_near_plus := LPAD(MOD(v_draw_numbers[1] + 1, 100)::TEXT, 2, '0');
  v_near_minus := LPAD(MOD(v_draw_numbers[1] - 1 + 100, 100)::TEXT, 2, '0');

  -- Determine if numeros contains JSON (premium) or flat numbers (free)
  SELECT EXISTS (
    SELECT 1 FROM user_predictions
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND array_length(numeros, 1) > 0 AND numeros[1] LIKE '{%'
  ) INTO v_is_json;

  -- WON
  IF v_is_json THEN
    UPDATE user_predictions SET status = 'WON', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND v_cabeza IN (
        SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2')
      );
  ELSE
    UPDATE user_predictions SET status = 'WON', verified_at = NOW()
    WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
      AND v_cabeza = ANY(numeros);
  END IF;
  GET DIAGNOSTICS v_won = ROW_COUNT;

  -- NEAR_MISS
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

  -- LOST: everything still PENDING
  UPDATE user_predictions SET status = 'LOST', verified_at = NOW()
  WHERE date = p_date AND turno = p_turno AND status = 'PENDING';
  GET DIAGNOSTICS v_lost = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true, 'cabeza', v_cabeza,
    'won', v_won, 'near_miss', v_near, 'lost', v_lost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api.verify_predictions_for_draw(DATE, TEXT) TO service_role;
