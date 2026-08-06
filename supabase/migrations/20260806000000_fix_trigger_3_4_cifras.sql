CREATE OR REPLACE FUNCTION trigger_refresh_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- 4-factor fast cache
  PERFORM refresh_cached_predictions(NEW.turno);

  -- 13-factor advanced analysis
  BEGIN
    PERFORM refresh_cached_predictions_v3(NEW.turno);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'refresh_cached_predictions_v3 failed: %', SQLERRM;
  END;

  -- 3/4 cifras cache
  BEGIN
    PERFORM refresh_cached_predictions_3_4(NEW.turno);
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'refresh_cached_predictions_3_4 failed: %', SQLERRM;
  END;

  -- Also refresh the previous turno (Markov chain dependency)
  IF NEW.turno = 'Primera' THEN
    PERFORM refresh_cached_predictions('Previa');
    BEGIN PERFORM refresh_cached_predictions_v3('Previa'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Previa'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Matutina' THEN
    PERFORM refresh_cached_predictions('Primera');
    BEGIN PERFORM refresh_cached_predictions_v3('Primera'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Primera'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Vespertina' THEN
    PERFORM refresh_cached_predictions('Matutina');
    BEGIN PERFORM refresh_cached_predictions_v3('Matutina'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Matutina'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Nocturna' THEN
    PERFORM refresh_cached_predictions('Vespertina');
    BEGIN PERFORM refresh_cached_predictions_v3('Vespertina'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Vespertina'); EXCEPTION WHEN OTHERS THEN NULL; END;
  ELSIF NEW.turno = 'Previa' THEN
    PERFORM refresh_cached_predictions('Nocturna');
    BEGIN PERFORM refresh_cached_predictions_v3('Nocturna'); EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN PERFORM refresh_cached_predictions_3_4('Nocturna'); EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN NEW;
END;
$$;
