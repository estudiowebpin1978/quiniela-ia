CREATE OR REPLACE FUNCTION get_analisis_global()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSON;
  global_data JSONB;
  turno_list TEXT[] := ARRAY['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'];
  t TEXT;
  turno_obj JSONB := '{}'::jsonb;
  turno_data JSONB;
BEGIN
  -- Global (all turnos)
  global_data := get_analisis_frecuencia(NULL)::jsonb;

  -- Per turno
  FOREACH t IN ARRAY turno_list LOOP
    turno_data := get_analisis_frecuencia(t)::jsonb;
    turno_obj := turno_obj || jsonb_build_object(lower(t), turno_data);
  END LOOP;

  result := jsonb_build_object(
    'global', global_data,
    'porTurno', turno_obj,
    'stats', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM draws),
      'turnos', (
        SELECT jsonb_agg(cnt ORDER BY tt)
        FROM (
          SELECT lower(turno) AS tt, COUNT(*)::INT AS cnt
          FROM draws GROUP BY lower(turno)
        ) sub
      )
    )
  )::json;

  RETURN result;
END;
$$;
