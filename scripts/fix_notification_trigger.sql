-- Fix notification trigger: use array_length instead of sum on positions
-- NEW.aciertos is INT[] of positions (e.g. [2, 15]), not values to sum

CREATE OR REPLACE FUNCTION notify_prediction_verified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_type TEXT;
  v_data JSONB;
  v_count INT;
BEGIN
  -- Only fire on status change from PENDING
  IF OLD.status = 'PENDING' AND NEW.status IN ('WON', 'LOST') THEN
    -- Count aciertos (positions array, not values)
    v_count := 0;
    IF NEW.aciertos IS NOT NULL THEN
      v_count := array_length(NEW.aciertos, 1);
    END IF;

    IF NEW.status = 'WON' THEN
      v_type := 'prediction_won';
      v_title := '🎉 ¡Predicción ganadora!';
      v_body := format('Acertaste %s cifra%s en %s del %s.', v_count, CASE WHEN v_count > 1 THEN 's' ELSE '' END, NEW.turno, to_char(NEW.date, 'DD/MM'));
    ELSE
      v_type := 'prediction_lost';
      v_title := '📊 Resultado verificado';
      v_body := format('Se verificó tu predicción para %s del %s. No hubo aciertos.', NEW.turno, to_char(NEW.date, 'DD/MM'));
    END IF;

    v_data := jsonb_build_object(
      'prediction_id', NEW.id,
      'date', NEW.date,
      'turno', NEW.turno,
      'status', NEW.status,
      'aciertos', NEW.aciertos
    );

    PERFORM insert_notification(NEW.user_id, v_type, v_title, v_body, v_data);
  END IF;

  RETURN NEW;
END;
$$;
