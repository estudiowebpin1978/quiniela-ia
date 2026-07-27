-- Rate Limiter RPC Function
-- Run this in Supabase SQL Editor

-- Create rate limit table
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits BIGINT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for cleanup
CREATE INDEX IF NOT EXISTS idx_rate_limits_updated_at ON rate_limits(updated_at);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION check_rate_limit(
  p_key TEXT,
  p_window_start BIGINT,
  p_now BIGINT,
  p_max BIGINT,
  p_window_sec BIGINT
)
RETURNS TABLE(
  allowed BOOLEAN,
  remaining BIGINT,
  reset_at BIGINT,
  total_hits BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_hits BIGINT[];
  v_valid_hits BIGINT[];
  v_count BIGINT;
  v_reset_at BIGINT;
BEGIN
  -- Get existing hits
  SELECT hits INTO v_hits FROM rate_limits WHERE key = p_key;
  
  IF v_hits IS NULL THEN
    -- First request
    v_valid_hits := ARRAY[p_now];
    v_count := 1;
    v_reset_at := p_now + 3600; -- Default 1 hour, will be updated by caller
    
    INSERT INTO rate_limits (key, hits, updated_at)
    VALUES (p_key, v_valid_hits, NOW())
    ON CONFLICT (key) DO UPDATE SET
      hits = EXCLUDED.hits,
      updated_at = NOW();
      
    RETURN QUERY SELECT true, p_max - 1, p_now + 3600, 1;
    RETURN;
  END IF;
  
  -- Filter hits within window
  v_valid_hits := ARRAY(
    SELECT unnest(v_hits)
    WHERE unnest > p_window_start
  );
  
  v_count := array_length(v_valid_hits, 1);
  IF v_count IS NULL THEN v_count := 0; END IF;
  
  IF v_count < p_max THEN
    -- Allow request
    v_valid_hits := v_valid_hits || p_now;
    v_count := v_count + 1;
    v_reset_at := p_now + 3600; -- Will be corrected by caller
    
    UPDATE rate_limits SET
      hits = v_valid_hits,
      updated_at = NOW()
    WHERE key = p_key;
    
    RETURN QUERY SELECT true, p_max - v_count, p_now + 3600, v_count;
  ELSE
    -- Rate limited
    -- Find oldest hit to calculate reset time
    v_reset_at := (SELECT min(unnest) FROM unnest(v_valid_hits) AS u) + p_window_sec;
    
    RETURN QUERY SELECT false, 0, v_reset_at, v_count;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION check_rate_limit TO anon, authenticated, service_role;

-- Cleanup function for old entries
CREATE OR REPLACE FUNCTION cleanup_rate_limits(p_max_age_hours INT DEFAULT 24)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM rate_limits 
  WHERE updated_at < NOW() - (p_max_age_hours || ' hours')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;