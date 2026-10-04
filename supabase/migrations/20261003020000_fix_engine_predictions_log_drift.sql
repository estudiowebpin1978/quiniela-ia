-- Fix (drift de BD): engine_predictions_log fallaba siempre en producción:
--   1) La columna user_id (añadida fuera de este repo) es NOT NULL pero el
--      registro del sistema (cron) no tiene usuario → 23502 null value.
--   2) public.engine_predictions_log_upsert usaba
--      ON CONFLICT (draw_id, turno, engine_name) sin índice único que lo
--      respalde (solo existe UNIQUE (draw_id, engine_name)) → 42P10
--      "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Se hace user_id nullable y se alinea la variante public con la variante api.

ALTER TABLE public.engine_predictions_log ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.engine_predictions_log_upsert(
  p_draw_id uuid, p_turno text, p_engine_name text, p_predicted_numbers integer[]
)
RETURNS void
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO public.engine_predictions_log (draw_id, turno, engine_name, predicted_numbers)
  VALUES (p_draw_id, p_turno, p_engine_name, p_predicted_numbers)
  ON CONFLICT (draw_id, engine_name)
  DO UPDATE SET
    predicted_numbers = EXCLUDED.predicted_numbers,
    turno = EXCLUDED.turno;
END;
$function$;
