-- Explicit verification RPC: verify_predictions_for_draw(p_date, p_turno)
-- Called by cron-scrape after saving a draw, in addition to the trigger.
-- This ensures verification happens even if the trigger fails.

CREATE OR REPLACE FUNCTION verify_predictions_for_draw(
  p_date DATE,
  p_turno TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_draw RECORD;
  v_cabeza_2 TEXT;
  v_updated INT := 0;
  v_won INT := 0;
  v_lost INT := 0;
  v_near INT := 0;
BEGIN
  -- Get the official draw
  SELECT d.numbers[1] AS cabeza, d.numbers[1:5] AS premios
  INTO v_draw
  FROM draws d
  WHERE d.date = p_date AND d.turno = p_turno
    AND d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) >= 5
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No draw found');
  END IF;

  v_cabeza_2 := LPAD(MOD(v_draw.cabeza, 100)::TEXT, 2, '0');

  -- Update WON: user's predicted numbers include the cabeza
  UPDATE user_predictions SET
    status = 'WON',
    verified_at = NOW(),
    resultado_oficial = to_jsonb(v_draw.premios)
  WHERE date = p_date
    AND turno = p_turno
    AND status = 'PENDING'
    AND (
      -- Check if any of user's predicted numbers match cabeza
      EXISTS (
        SELECT 1 FROM unnest(
          CASE
            WHEN numeros[1] LIKE '{%' THEN
              ARRAY(SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2'))
            ELSE numeros
          END
        ) AS num WHERE num = v_cabeza_2
      )
    );
  GET DIAGNOSTICS v_won = ROW_COUNT;
  v_updated := v_updated + v_won;

  -- Update NEAR_MISS: difference of ±1 from cabeza (and not already WON)
  UPDATE user_predictions SET
    status = 'NEAR_MISS',
    verified_at = NOW(),
    resultado_oficial = to_jsonb(v_draw.premios)
  WHERE date = p_date
    AND turno = p_turno
    AND status = 'PENDING'
    AND EXISTS (
      SELECT 1 FROM unnest(
        CASE
          WHEN numeros[1] LIKE '{%' THEN
            ARRAY(SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2'))
          ELSE numeros
        END
      ) AS num WHERE ABS(CAST(num AS INT) - CAST(v_cabeza_2 AS INT)) = 1
    );
  GET DIAGNOSTICS v_near = ROW_COUNT;
  v_updated := v_updated + v_near;

  -- Update LOST: everything still PENDING after checks
  UPDATE user_predictions SET
    status = 'LOST',
    verified_at = NOW(),
    resultado_oficial = to_jsonb(v_draw.premios)
  WHERE date = p_date
    AND turno = p_turno
    AND status = 'PENDING';
  GET DIAGNOSTICS v_lost = ROW_COUNT;
  v_updated := v_updated + v_lost;

  -- Insert prediction_history for all verified predictions
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
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'2'))
      ELSE up.numeros
    END,
    to_jsonb(v_draw.premios),
    CASE
      WHEN up.status = 'WON' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 1))
      WHEN up.status = 'NEAR_MISS' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 0))
      ELSE '[]'::jsonb
    END,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    true,
    NOW(),
    (SELECT game_id FROM draws WHERE date = p_date AND turno = p_turno LIMIT 1)
  FROM user_predictions up
  WHERE up.date = p_date
    AND up.turno = p_turno
    AND up.verified_at = NOW()
    AND up.id NOT IN (SELECT prediction_id FROM prediction_history WHERE prediction_id = up.id)
  ON CONFLICT (prediction_id) DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'date', p_date,
    'turno', p_turno,
    'cabeza', v_cabeza_2,
    'won', v_won,
    'near_miss', v_near,
    'lost', v_lost,
    'total_verified', v_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_predictions_for_draw(DATE, TEXT) TO service_role;
