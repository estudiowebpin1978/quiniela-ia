-- Motor Performance tracking table + RPCs
-- Tracks accuracy of each analysis motor per turno

CREATE TABLE IF NOT EXISTS motor_performance (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  motor TEXT NOT NULL,
  turno TEXT NOT NULL,
  accuracy NUMERIC DEFAULT 0,
  times_used INT DEFAULT 0,
  total_hits INT DEFAULT 0,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(motor, turno)
);

-- Drop and recreate functions to ensure correct signatures
DROP FUNCTION IF EXISTS update_motor_performance(text,text,numeric);
DROP FUNCTION IF EXISTS get_top_motors(text,int);
DROP FUNCTION IF EXISTS should_run_motor(text,text);
DROP FUNCTION IF EXISTS get_skipped_motors(text);
DROP FUNCTION IF EXISTS clear_old_motor_performance(int);

-- Upsert motor performance: increment times_used, recalculate accuracy as rolling avg
CREATE OR REPLACE FUNCTION update_motor_performance(
  p_motor TEXT,
  p_turno TEXT,
  p_hit_rate NUMERIC
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO motor_performance (motor, turno, accuracy, times_used, total_hits, last_used, updated_at)
  VALUES (
    p_motor,
    p_turno,
    p_hit_rate,
    1,
    CASE WHEN p_hit_rate > 0 THEN 1 ELSE 0 END,
    NOW(),
    NOW()
  )
  ON CONFLICT (motor, turno) DO UPDATE SET
    accuracy = (motor_performance.accuracy * motor_performance.times_used + p_hit_rate) / (motor_performance.times_used + 1),
    times_used = motor_performance.times_used + 1,
    total_hits = motor_performance.total_hits + CASE WHEN p_hit_rate > 0 THEN 1 ELSE 0 END,
    last_used = NOW(),
    updated_at = NOW();
END;
$$;

-- Get top N motors by accuracy for a turno
CREATE OR REPLACE FUNCTION get_top_motors(
  p_turno TEXT,
  p_count INT DEFAULT 16
)
RETURNS TABLE(motor TEXT, accuracy NUMERIC)
LANGUAGE sql
STABLE
AS $$
  SELECT mp.motor, mp.accuracy
  FROM motor_performance mp
  WHERE mp.turno = p_turno AND mp.times_used >= 3
  ORDER BY mp.accuracy DESC
  LIMIT p_count;
$$;

-- Should this motor be skipped? (accuracy too low after enough data)
CREATE OR REPLACE FUNCTION should_run_motor(
  p_motor TEXT,
  p_turno TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT accuracy >= 0.15 OR times_used < 10
     FROM motor_performance
     WHERE motor = p_motor AND turno = p_turno),
    TRUE
  );
$$;

-- Get motors that should be skipped (below threshold)
CREATE OR REPLACE FUNCTION get_skipped_motors(
  p_turno TEXT
)
RETURNS TABLE(motor TEXT)
LANGUAGE sql
STABLE
AS $$
  SELECT mp.motor
  FROM motor_performance mp
  WHERE mp.turno = p_turno
    AND mp.times_used >= 10
    AND mp.accuracy < 0.15;
$$;

-- Clear old performance data
CREATE OR REPLACE FUNCTION clear_old_motor_performance(
  p_max_age_hours INT DEFAULT 168
)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM motor_performance
  WHERE last_used < NOW() - (p_max_age_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_motor_performance_turno ON motor_performance(turno);
CREATE INDEX IF NOT EXISTS idx_motor_performance_motor ON motor_performance(motor);
