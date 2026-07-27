-- Verification Queue Table + RPCs
-- Enables async verification of predictions against draw results

-- Queue table for verification jobs
CREATE TABLE IF NOT EXISTS verification_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  error TEXT
);

-- Index for efficient polling
CREATE INDEX IF NOT EXISTS idx_verification_queue_status ON verification_queue(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_verification_queue_created ON verification_queue(created_at);

-- Enqueue a verification job
CREATE OR REPLACE FUNCTION enqueue_verification(p_payload TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO verification_queue (payload, status, priority)
  VALUES (p_payload::jsonb, 'pending', 0);
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

-- Claim next batch of pending jobs (atomic)
CREATE OR REPLACE FUNCTION claim_verification_jobs(p_batch_size INT DEFAULT 10)
RETURNS TABLE(
  id UUID,
  payload JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE verification_queue vq
  SET status = 'processing', processed_at = NOW()
  WHERE vq.id IN (
    SELECT vq2.id FROM verification_queue vq2
    WHERE vq2.status = 'pending'
    ORDER BY vq2.priority DESC, vq2.created_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING vq.id, vq.payload, vq.created_at;
END;
$$;

-- Mark a job as completed
CREATE OR REPLACE FUNCTION complete_verification_job(p_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE verification_queue
  SET status = 'completed', processed_at = NOW()
  WHERE id = p_id AND status = 'processing';
  RETURN FOUND;
END;
$$;

-- Mark a job as failed
CREATE OR REPLACE FUNCTION fail_verification_job(p_id UUID, p_error TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE verification_queue
  SET status = 'failed', processed_at = NOW(), error = p_error
  WHERE id = p_id AND status = 'processing';
  RETURN FOUND;
END;
$$;

-- Cleanup old completed/failed jobs
CREATE OR REPLACE FUNCTION cleanup_verification_queue(p_max_age_hours INT DEFAULT 48)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted BIGINT;
BEGIN
  DELETE FROM verification_queue
  WHERE status IN ('completed', 'failed')
    AND processed_at < NOW() - (p_max_age_hours || ' hours')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION enqueue_verification TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION claim_verification_jobs TO service_role;
GRANT EXECUTE ON FUNCTION complete_verification_job TO service_role;
GRANT EXECUTE ON FUNCTION fail_verification_job TO service_role;
GRANT EXECUTE ON FUNCTION cleanup_verification_queue TO service_role;
