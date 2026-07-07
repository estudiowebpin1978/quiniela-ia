-- motor_performance: persistencia de accuracy por motor/turno
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS motor_performance (
  id BIGSERIAL PRIMARY KEY,
  motor TEXT NOT NULL,
  turno TEXT NOT NULL,
  accuracy NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (motor, turno)
);

CREATE INDEX IF NOT EXISTS idx_motor_performance_turno ON motor_performance (turno);

-- RLS: only service role
ALTER TABLE motor_performance ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role only" ON motor_performance;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
CREATE POLICY "Service role only" ON motor_performance FOR ALL USING (true);

-- Function to update accuracy (upsert with running average)
-- Usage: SELECT update_motor_performance('factores30', 'previa', 0.42);
CREATE OR REPLACE FUNCTION update_motor_performance(
  p_motor TEXT,
  p_turno TEXT,
  p_hit_rate NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO motor_performance (motor, turno, accuracy, times_used, last_used)
  VALUES (p_motor, p_turno, p_hit_rate, 1, NOW())
  ON CONFLICT (motor, turno) DO UPDATE SET
    accuracy = (motor_performance.accuracy * motor_performance.times_used + p_hit_rate) / (motor_performance.times_used + 1),
    times_used = motor_performance.times_used + 1,
    last_used = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get top motors for a turno
CREATE OR REPLACE FUNCTION get_top_motors(p_turno TEXT, p_count INTEGER DEFAULT 16)
RETURNS TABLE (motor TEXT, accuracy NUMERIC, times_used INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT motor, accuracy, times_used
  FROM motor_performance
  WHERE turno = p_turno
  ORDER BY 
    CASE WHEN times_used < 3 THEN 0 ELSE 1 END DESC,  -- prioritize untested
    accuracy DESC
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get skipped motors (weak after 5 uses)
CREATE OR REPLACE FUNCTION get_skipped_motors(p_turno TEXT)
RETURNS TABLE (motor TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT motor
  FROM motor_performance
  WHERE turno = p_turno
    AND times_used >= 5
    AND accuracy < 0.3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if motor should run
CREATE OR REPLACE FUNCTION should_run_motor(p_motor TEXT, p_turno TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_entry motor_performance%ROWTYPE;
BEGIN
  SELECT * INTO v_entry
  FROM motor_performance
  WHERE motor = p_motor AND turno = p_turno;
  
  IF NOT FOUND THEN RETURN TRUE; END IF;
  IF v_entry.times_used < 3 THEN RETURN TRUE; END IF;
  IF v_entry.accuracy < 0.3 AND v_entry.times_used >= 5 THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to clear old entries (TTL)
CREATE OR REPLACE FUNCTION clear_old_motor_performance(p_max_age_hours INTEGER DEFAULT 6)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM motor_performance
  WHERE last_used < NOW() - (p_max_age_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;