-- =============================================================
-- FUNCIÓN DE BACKTESTING: test_omega_v6_quantum
-- =============================================================

DROP FUNCTION IF EXISTS test_omega_v6_quantum(int, text);

CREATE OR REPLACE FUNCTION test_omega_v6_quantum(
  p_test_days INT DEFAULT 30,
  p_turno TEXT DEFAULT NULL
)
RETURNS TABLE (
  test_date DATE,
  turno TEXT,
  winner_t2 TEXT,
  predicted_top10 TEXT[],
  hit BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  r RECORD;
  v_pred JSONB;
  v_top10 TEXT[];
BEGIN
  FOR r IN
    SELECT DISTINCT date, d.turno AS t_turno
    FROM draws d
    WHERE d.game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
      AND d.date >= (SELECT MAX(date) FROM draws) - INTERVAL '1 day' * p_test_days
      AND (p_turno IS NULL OR d.turno = p_turno)
    ORDER BY d.date DESC, d.turno
  LOOP
    SELECT calculate_omega_v6_quantum(r.t_turno, 'free', r.date - INTERVAL '1 day')
    INTO v_pred;

    SELECT ARRAY(
      SELECT (elem->>'terminacion')
      FROM jsonb_array_elements(v_pred->'2') elem
      ORDER BY (elem->>'score')::NUMERIC DESC
      LIMIT 10
    ) INTO v_top10;

    RETURN QUERY SELECT
      r.date,
      r.t_turno AS turno,
      LPAD(MOD((d.numbers)[1], 100)::TEXT, 2, '0') AS winner_t2,
      v_top10,
      LPAD(MOD((d.numbers)[1], 100)::TEXT, 2, '0') = ANY(v_top10) AS hit
    FROM draws d
    WHERE d.id = (
      SELECT id FROM draws
      WHERE date = r.date AND turno = r.t_turno
      ORDER BY created_at DESC LIMIT 1
    );
  END LOOP;
END;
$$;

-- =============================================================
-- CONSULTA DE VALIDACIÓN RÁPIDA
-- Ejecutar en SQL Editor para ver hit rate:
-- =============================================================
-- SELECT
--   COUNT(*) FILTER (WHERE hit)::NUMERIC / COUNT(*) AS hit_rate,
--   0.10 AS expected_random,
--   COUNT(*) FILTER (WHERE hit) AS hits,
--   COUNT(*) AS total
-- FROM test_omega_v6_quantum(30, NULL);