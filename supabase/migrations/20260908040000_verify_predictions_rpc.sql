-- Explicit verification RPC: verify_predictions_for_draw(p_date, p_turno)
-- Called by cron-scrape after saving a draw, in addition to the trigger.
-- This ensures verification happens even if the trigger fails.
-- NOTE: Function is in 'api' schema (where PostgREST looks), not 'public'.

CREATE OR REPLACE FUNCTION api.verify_predictions_for_draw(
  p_date DATE,
  p_turno TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza_2 TEXT;
  v_draw_numbers INT[];
  v_won INT := 0;
  v_near INT := 0;
  v_lost INT := 0;
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

  v_cabeza_2 := LPAD(MOD(v_draw_numbers[1], 100)::TEXT, 2, '0');

  UPDATE user_predictions SET status = 'WON', verified_at = NOW()
  WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
    AND v_cabeza_2 = ANY(numeros);
  GET DIAGNOSTICS v_won = ROW_COUNT;

  UPDATE user_predictions SET status = 'NEAR_MISS', verified_at = NOW()
  WHERE date = p_date AND turno = p_turno AND status = 'PENDING'
    AND EXISTS (
      SELECT 1 FROM unnest(numeros) AS num
      WHERE num = v_cabeza_2 OR num = LPAD(MOD(v_draw_numbers[1] + 1, 100)::TEXT, 2, '0')
        OR num = LPAD(MOD(v_draw_numbers[1] - 1, 100)::TEXT, 2, '0')
    );
  GET DIAGNOSTICS v_near = ROW_COUNT;

  UPDATE user_predictions SET status = 'LOST', verified_at = NOW()
  WHERE date = p_date AND turno = p_turno AND status = 'PENDING';
  GET DIAGNOSTICS v_lost = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true, 'cabeza', v_cabeza_2,
    'won', v_won, 'near_miss', v_near, 'lost', v_lost
  );
END;
$$;

GRANT EXECUTE ON FUNCTION api.verify_predictions_for_draw(DATE, TEXT) TO service_role;
