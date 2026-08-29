-- Migration: Create webhook_logs table for idempotency
-- This table prevents duplicate webhook processing

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL DEFAULT 'ualabis',
  payload JSONB,
  order_id TEXT,
  user_id UUID,
  status TEXT DEFAULT 'processed',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint on order_id for idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_logs_order_id 
  ON webhook_logs (order_id) 
  WHERE order_id IS NOT NULL;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at 
  ON webhook_logs (created_at DESC);

-- RLS: only service role can access
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON webhook_logs
  FOR ALL
  USING (auth.role() = 'service_role');
