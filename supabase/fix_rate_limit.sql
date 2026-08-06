DROP FUNCTION IF EXISTS check_rate_limit(text, bigint, bigint, bigint, bigint);

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
  SELECT hits INTO v_hits FROM rate_limits WHERE key = p_key;
  IF v_hits IS NULL THEN
    v_valid_hits := ARRAY[p_now];
    v_count := 1::BIGINT;
    v_reset_at := p_now + 3600;
    INSERT INTO rate_limits (key, hits, updated_at)
    VALUES (p_key, v_valid_hits, NOW())
    ON CONFLICT (key) DO UPDATE SET hits = EXCLUDED.hits, updated_at = NOW();
    RETURN QUERY SELECT true::BOOLEAN, (p_max - 1)::BIGINT, (p_now + 3600)::BIGINT, 1::BIGINT;
    RETURN;
  END IF;
  v_valid_hits := ARRAY(SELECT unnest(v_hits) WHERE unnest > p_window_start);
  v_count := array_length(v_valid_hits, 1)::BIGINT;
  IF v_count IS NULL THEN v_count := 0::BIGINT; END IF;
  IF v_count < p_max THEN
    v_valid_hits := v_valid_hits || p_now;
    v_count := v_count + 1;
    UPDATE rate_limits SET hits = v_valid_hits, updated_at = NOW() WHERE key = p_key;
    RETURN QUERY SELECT true::BOOLEAN, (p_max - v_count)::BIGINT, (p_now + 3600)::BIGINT, v_count::BIGINT;
  ELSE
    v_reset_at := (SELECT min(unnest) FROM unnest(v_valid_hits) AS u) + p_window_sec;
    RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, v_reset_at::BIGINT, v_count::BIGINT;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION check_rate_limit TO anon, authenticated, service_role;
