-- =============================================================================
-- MIGRATION: Supabase RPCs for heavy analytics
-- Replaces 10,000-row fetches with single RPC calls
-- Date: 2026-08-21
-- =============================================================================

-- 1. RPC: get_estadisticas() — replaces /api/estadisticas
-- =============================================================================
CREATE OR REPLACE FUNCTION get_estadisticas()
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH unique_dates AS (
    SELECT DISTINCT date FROM draws ORDER BY date DESC
  ),
  ordered_dates AS (
    SELECT date, ROW_NUMBER() OVER (ORDER BY date DESC) AS rn
    FROM unique_dates
  ),
  streak_calc AS (
    SELECT COUNT(*) AS racha
    FROM ordered_dates o1
    WHERE o1.rn <= 120
      AND NOT EXISTS (
        SELECT 1 FROM ordered_dates o2
        WHERE o2.date = o1.date + 1
      )
      AND o1.date = (SELECT MAX(date) FROM draws)
  )
  SELECT json_build_object(
    'totalSorteos', (SELECT COUNT(*) FROM draws),
    'diasConDatos', (SELECT COUNT(*) FROM unique_dates),
    'racha', COALESCE((SELECT racha FROM streak_calc), 0),
    'pct', '--',
    'ultimosDias', (
      SELECT json_agg(d.date ORDER BY d.date DESC)
      FROM (SELECT date FROM unique_dates LIMIT 5) d
    )
  )::json;
$$;


-- 2. RPC: get_analisis_frecuencia(turno TEXT) — replaces /api/analisis per-turno
-- =============================================================================
CREATE OR REPLACE FUNCTION get_analisis_frecuencia(
  p_turno TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT date, numbers FROM draws
    WHERE (p_turno IS NULL OR turno = p_turno)
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC
  ),
  all_numbers AS (
    SELECT MOD(unnest(numbers), 100) AS numero, date
    FROM filtered
  ),
  frequency AS (
    SELECT numero, COUNT(*) AS conteo
    FROM all_numbers
    GROUP BY numero
    ORDER BY conteo DESC
  ),
  pairs_raw AS (
    SELECT DISTINCT a.numero AS n1, b.numero AS n2, f.date
    FROM filtered f,
    LATERAL (SELECT DISTINCT MOD(unnest(f.numbers), 100) AS numero) a,
    LATERAL (SELECT DISTINCT MOD(unnest(f.numbers), 100) AS numero) b
    WHERE a.numero < b.numero
  ),
  pairs AS (
    SELECT n1, n2, COUNT(*) AS conteo
    FROM pairs_raw
    GROUP BY n1, n2
    ORDER BY conteo DESC
  ),
  last_seen AS (
    SELECT numero, MAX(date) AS ultima_fecha
    FROM all_numbers
    GROUP BY numero
  ),
  overdue AS (
    SELECT f.numero,
           (CURRENT_DATE - ls.ultima_fecha)::INT AS dias_ausente
    FROM frequency f
    JOIN last_seen ls ON f.numero = ls.numero
    ORDER BY dias_ausente DESC
    LIMIT 20
  )
  SELECT json_build_object(
    'frecuencia', (
      SELECT json_agg(json_build_object('numero', numero, 'conteo', conteo) ORDER BY conteo DESC)
      FROM (SELECT numero, conteo FROM frequency LIMIT 30) f
    ),
    'pares', (
      SELECT json_agg(json_build_object('numeros', ARRAY[n1, n2], 'conteo', conteo) ORDER BY conteo DESC)
      FROM (SELECT n1, n2, conteo FROM pairs LIMIT 25) p
    ),
    'numerosAtrasados', (
      SELECT json_agg(json_build_object('numero', numero, 'diasAusente', dias_ausente) ORDER BY dias_ausente DESC)
      FROM overdue o
    ),
    'recent', (
      SELECT json_agg(json_build_object('numero', numero, 'ultimaFecha', ultima_fecha) ORDER BY ultima_fecha DESC)
      FROM (SELECT numero, ultima_fecha::TEXT AS ultima_fecha FROM last_seen ORDER BY ultima_fecha DESC LIMIT 10) r
    ),
    'totalSorteos', (SELECT COUNT(*) FROM filtered),
    'fechaInicio', (SELECT MIN(date)::TEXT FROM filtered),
    'fechaFin', (SELECT MAX(date)::TEXT FROM filtered)
  )::json;
$$;


-- 3. RPC: get_analisis_global() — replaces /api/analisis full response
-- =============================================================================
CREATE OR REPLACE FUNCTION get_analisis_global()
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSON;
  global_data JSON;
  turno_data JSON;
  turno_list TEXT[] := ARRAY['previa', 'primera', 'matutina', 'vespertina', 'nocturna'];
  t TEXT;
  turno_obj JSON;
BEGIN
  -- Global (all turnos)
  global_data := get_analisis_frecuencia(NULL);

  -- Per turno
  turno_obj := '{}'::json;
  FOREACH t IN ARRAY turno_list LOOP
    turno_obj := turno_obj || json_build_object(t, get_analisis_frecuencia(t));
  END LOOP;

  result := json_build_object(
    'global', global_data,
    'porTurno', turno_obj,
    'stats', json_build_object(
      'total', (SELECT COUNT(*) FROM draws),
      'turnos', (
        SELECT json_agg(cnt ORDER BY t)
        FROM (
          SELECT turno AS t, COUNT(*) AS cnt
          FROM draws GROUP BY turno
        ) sub
      )
    )
  );

  RETURN result;
END;
$$;


-- 4. RPC: get_number_history(num INT) — replaces /api/number-history
-- =============================================================================
CREATE OR REPLACE FUNCTION get_number_history(
  p_number INT
)
RETURNS JSON
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT id, date, turno, numbers,
           MOD(unnest(numbers), 100) AS num_in_draw
    FROM draws
    ORDER BY date DESC
  ),
  target_draws AS (
    SELECT date, turno, num_in_draw
    FROM filtered
    WHERE num_in_draw = p_number
  ),
  turno_stats AS (
    SELECT turno,
           COUNT(*) AS appearances,
           MAX(date)::TEXT AS last_seen,
           MIN(date)::TEXT AS first_seen
    FROM target_draws
    GROUP BY turno
  ),
  total_draws AS (
    SELECT COUNT(*) AS total FROM draws
  ),
  total_with_num AS (
    SELECT COUNT(DISTINCT date || turno) AS total FROM target_draws
  ),
  gaps AS (
    SELECT t.turno,
           COUNT(*) AS consecutive_absent
    FROM (
      SELECT DISTINCT date, turno FROM draws
      WHERE turno IN ('previa', 'primera', 'matutina', 'vespertina', 'nocturna')
      ORDER BY date DESC
    ) t
    WHERE NOT EXISTS (
      SELECT 1 FROM target_draws td
      WHERE td.date = t.date AND td.turno = t.turno
    )
    AND t.date > (SELECT MAX(date) FROM target_draws WHERE turno = t.turno)
    GROUP BY t.turno
  ),
  position_dist AS (
    SELECT pos, COUNT(*) AS count
    FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY date, turno ORDER BY 1) AS pos
      FROM filtered
      WHERE num_in_draw = p_number
    ) sub
    GROUP BY pos
    ORDER BY pos
  ),
  recent_trend AS (
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT date, turno FROM draws ORDER BY date DESC LIMIT 30
      ) last30
      WHERE EXISTS (
        SELECT 1 FROM target_draws td
        WHERE td.date = last30.date AND td.turno = last30.turno
      )
      ) AS recent_hits,
      (SELECT COUNT(*) FROM (
        SELECT date, turno FROM draws ORDER BY date DESC LIMIT 30 OFFSET 30
      ) prev30
      WHERE EXISTS (
        SELECT 1 FROM target_draws td
        WHERE td.date = prev30.date AND td.turno = prev30.turno
      )
      ) AS prev_hits
  )
  SELECT json_build_object(
    'number', p_number,
    'totalAppearances', (SELECT total FROM total_with_num),
    'totalDraws', (SELECT total FROM total_draws),
    'frequency', ROUND((SELECT total FROM total_with_num)::NUMERIC / NULLIF((SELECT total FROM total_draws), 0) * 100, 2),
    'expectedFrequency', 20.0,
    'byTurno', (
      SELECT json_object_agg(turno, json_build_object(
        'appearances', appearances,
        'lastSeen', last_seen,
        'firstSeen', first_seen,
        'consecutiveAbsent', COALESCE(
          (SELECT consecutive_absent FROM gaps g WHERE g.turno = ts.turno), 0
        )
      ))
      FROM turno_stats ts
    ),
    'positionDistribution', (
      SELECT json_agg(json_build_object('position', pos, 'count', count) ORDER BY pos)
      FROM position_dist
    ),
    'recentTrend', (
      SELECT json_build_object(
        'recentHits', recent_hits,
        'prevHits', prev_hits,
        'trend', CASE
          WHEN recent_hits > prev_hits * 1.3 THEN 'hot'
          WHEN recent_hits < prev_hits * 0.7 THEN 'cold'
          ELSE 'stable'
        END
      )
      FROM recent_trend
    ),
    'recentAppearances', (
      SELECT json_agg(json_build_object('date', date, 'turno', turno) ORDER BY date DESC)
      FROM (SELECT date, turno FROM target_draws ORDER BY date DESC LIMIT 20) sub
    )
  )::json;
$$;


-- DONE
-- =============================================================================
