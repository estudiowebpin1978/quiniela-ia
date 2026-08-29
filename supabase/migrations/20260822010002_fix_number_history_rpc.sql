CREATE OR REPLACE FUNCTION get_number_history(p_number INT)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  result JSON;
  total_draws_count INT;
  total_appearances INT;
  freq NUMERIC;
  by_turno JSON;
  pos_dist JSON;
  recent_trend_data JSON;
  recent_appearances JSON;
  gaps_data JSON;
BEGIN
  SELECT COUNT(*) INTO total_draws_count FROM draws;

  -- byTurno + appearances count
  SELECT json_object_agg(
    turno, json_build_object(
      'appearances', appearances,
      'lastSeen', last_seen,
      'firstSeen', first_seen
    )
  ), SUM(appearances)
  INTO by_turno, total_appearances
  FROM (
    SELECT turno, COUNT(*) AS appearances,
           MAX(date)::TEXT AS last_seen,
           MIN(date)::TEXT AS first_seen
    FROM draws
    WHERE p_number = ANY(SELECT MOD(unnest(numbers), 100) FROM unnest(numbers))
    GROUP BY turno
  ) sub;

  -- Fix: actual calculation
  total_appearances := 0;
  SELECT json_object_agg(
    sub.turno, json_build_object(
      'appearances', sub.appearances,
      'lastSeen', sub.last_seen,
      'firstSeen', sub.first_seen,
      'consecutiveAbsent', COALESCE(g.gap, 0)
    )
  ), SUM(sub.appearances)
  INTO by_turno, total_appearances
  FROM (
    SELECT d.turno, COUNT(*) AS appearances,
           MAX(d.date)::TEXT AS last_seen,
           MIN(d.date)::TEXT AS first_seen
    FROM draws d
    WHERE EXISTS (
      SELECT 1 FROM unnest(d.numbers) AS n WHERE MOD(n, 100) = p_number
    )
    GROUP BY d.turno
  ) sub
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS gap
    FROM draws d2
    WHERE LOWER(d2.turno) = LOWER(sub.turno)
      AND d2.date > sub.last_seen::date
  ) g ON true;

  freq := ROUND(total_appearances::NUMERIC / NULLIF(total_draws_count, 0) * 100, 2);

  -- Position distribution
  SELECT json_agg(json_build_object('position', pos, 'count', cnt) ORDER BY pos)
  INTO pos_dist
  FROM (
    SELECT pos, COUNT(*) AS cnt
    FROM (
      SELECT ROW_NUMBER() OVER (PARTITION BY d.date, d.turno ORDER BY 1) AS pos
      FROM draws d,
      LATERAL unnest(d.numbers) AS n
      WHERE MOD(n, 100) = p_number
    ) sub
    GROUP BY pos
  ) p;

  -- Recent trend
  SELECT json_build_object(
    'recentHits', recent_hits,
    'prevHits', prev_hits,
    'trend', CASE
      WHEN recent_hits > prev_hits * 1.3 THEN 'hot'
      WHEN recent_hits < prev_hits * 0.7 THEN 'cold'
      ELSE 'stable'
    END
  )
  INTO recent_trend_data
  FROM (
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT d.date, d.turno FROM draws d ORDER BY d.date DESC LIMIT 30
      ) last30
      WHERE EXISTS (
        SELECT 1 FROM draws d
        WHERE d.date = last30.date AND d.turno = last30.turno
          AND EXISTS (SELECT 1 FROM unnest(d.numbers) n WHERE MOD(n, 100) = p_number)
      )) AS recent_hits,
      (SELECT COUNT(*) FROM (
        SELECT d.date, d.turno FROM draws d ORDER BY d.date DESC LIMIT 30 OFFSET 30
      ) prev30
      WHERE EXISTS (
        SELECT 1 FROM draws d
        WHERE d.date = prev30.date AND d.turno = prev30.turno
          AND EXISTS (SELECT 1 FROM unnest(d.numbers) n WHERE MOD(n, 100) = p_number)
      )) AS prev_hits
  ) t;

  -- Recent appearances
  SELECT json_agg(json_build_object('date', date, 'turno', turno) ORDER BY date DESC)
  INTO recent_appearances
  FROM (
    SELECT d.date::TEXT, d.turno
    FROM draws d
    WHERE EXISTS (
      SELECT 1 FROM unnest(d.numbers) n WHERE MOD(n, 100) = p_number
    )
    ORDER BY d.date DESC
    LIMIT 20
  ) sub;

  result := json_build_object(
    'number', p_number,
    'totalAppearances', COALESCE(total_appearances, 0),
    'totalDraws', total_draws_count,
    'frequency', COALESCE(freq, 0),
    'expectedFrequency', 20.0,
    'byTurno', COALESCE(by_turno, '{}'::json),
    'positionDistribution', COALESCE(pos_dist, '[]'::json),
    'recentTrend', recent_trend_data,
    'recentAppearances', COALESCE(recent_appearances, '[]'::json)
  );

  RETURN result;
END;
$$;
