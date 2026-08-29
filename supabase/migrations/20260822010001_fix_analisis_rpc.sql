CREATE OR REPLACE FUNCTION get_analisis_frecuencia(p_turno TEXT DEFAULT NULL)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSON;
  freq_data JSON;
  pairs_data JSON;
  overdue_data JSON;
  recent_data JSON;
  total INT;
  min_date TEXT;
  max_date TEXT;
BEGIN
  -- Frequency
  SELECT json_agg(json_build_object('numero', numero, 'conteo', conteo) ORDER BY conteo DESC)
  INTO freq_data
  FROM (
    SELECT MOD(unnest(numbers), 100) AS numero, COUNT(*) AS conteo
    FROM draws
    WHERE (p_turno IS NULL OR LOWER(turno) = LOWER(p_turno))
      AND array_length(numbers, 1) >= 20
    GROUP BY MOD(unnest(numbers), 100)
    ORDER BY conteo DESC
    LIMIT 30
  ) f;

  -- Pairs
  SELECT json_agg(json_build_object('numeros', ARRAY[n1, n2], 'conteo', conteo) ORDER BY conteo DESC)
  INTO pairs_data
  FROM (
    SELECT a.n AS n1, b.n AS n2, COUNT(*) AS conteo
    FROM draws d,
    LATERAL (SELECT DISTINCT MOD(unnest(d.numbers), 100) AS n) a,
    LATERAL (SELECT DISTINCT MOD(unnest(d.numbers), 100) AS n) b
    WHERE (p_turno IS NULL OR LOWER(d.turno) = LOWER(p_turno))
      AND array_length(d.numbers, 1) >= 20
      AND a.n < b.n
    GROUP BY a.n, b.n
    ORDER BY conteo DESC
    LIMIT 25
  ) p;

  -- Overdue
  SELECT json_agg(json_build_object('numero', numero, 'diasAusente', dias_ausente) ORDER BY dias_ausente DESC)
  INTO overdue_data
  FROM (
    SELECT numero, (CURRENT_DATE - ultima_fecha)::INT AS dias_ausente
    FROM (
      SELECT MOD(unnest(numbers), 100) AS numero, MAX(date) AS ultima_fecha
      FROM draws
      WHERE (p_turno IS NULL OR LOWER(turno) = LOWER(p_turno))
        AND array_length(numbers, 1) >= 20
      GROUP BY MOD(unnest(numbers), 100)
    ) sub
    ORDER BY dias_ausente DESC
    LIMIT 20
  ) o;

  -- Recent
  SELECT json_agg(json_build_object('numero', numero, 'ultimaFecha', ultima_fecha) ORDER BY ultima_fecha DESC)
  INTO recent_data
  FROM (
    SELECT MOD(unnest(numbers), 100) AS numero, MAX(date)::TEXT AS ultima_fecha
    FROM draws
    WHERE (p_turno IS NULL OR LOWER(turno) = LOWER(p_turno))
      AND array_length(numbers, 1) >= 20
    GROUP BY MOD(unnest(numbers), 100)
    ORDER BY ultima_fecha DESC
    LIMIT 10
  ) r;

  -- Stats
  SELECT COUNT(*), MIN(date)::TEXT, MAX(date)::TEXT
  INTO total, min_date, max_date
  FROM draws
  WHERE (p_turno IS NULL OR LOWER(turno) = LOWER(p_turno))
    AND array_length(numbers, 1) >= 20;

  result := json_build_object(
    'frecuencia', COALESCE(freq_data, '[]'::json),
    'pares', COALESCE(pairs_data, '[]'::json),
    'numerosAtrasados', COALESCE(overdue_data, '[]'::json),
    'recent', COALESCE(recent_data, '[]'::json),
    'totalSorteos', COALESCE(total, 0),
    'fechaInicio', min_date,
    'fechaFin', max_date
  );

  RETURN result;
END;
$$;
