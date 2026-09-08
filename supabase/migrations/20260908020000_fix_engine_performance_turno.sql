-- FIX: update_engine_performance — add p_turno parameter
-- Problem: Writes to turno='ALL' regardless of which turno the prediction was for
-- Fix: Accept p_turno parameter and write to the correct row

DROP FUNCTION IF EXISTS update_engine_performance(TEXT, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION update_engine_performance(
  p_engine_name TEXT,
  p_hit BOOLEAN,
  p_near_miss BOOLEAN,
  p_turno TEXT DEFAULT 'ALL'
) RETURNS void AS $$
BEGIN
  INSERT INTO engine_performance (turno, engine_name, hit_count, near_miss_count, total_runs, updated_at)
  VALUES (
    p_turno,
    p_engine_name,
    CASE WHEN p_hit THEN 1 ELSE 0 END,
    CASE WHEN p_near_miss THEN 1 ELSE 0 END,
    1,
    NOW()
  )
  ON CONFLICT (turno, engine_name)
  DO UPDATE SET
    total_runs = engine_performance.total_runs + 1,
    hit_count = engine_performance.hit_count + CASE WHEN p_hit THEN 1 ELSE 0 END,
    near_miss_count = engine_performance.near_miss_count + CASE WHEN p_near_miss THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION update_engine_performance(TEXT, BOOLEAN, BOOLEAN, TEXT) TO service_role;
