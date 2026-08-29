-- =============================================================
-- cron_logs: Persistent execution log for all cron jobs.
-- Enables operational visibility without digging through Vercel logs.
-- =============================================================

CREATE TABLE IF NOT EXISTS public.cron_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  cron_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  duration_ms INT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cron_logs_name_created
  ON public.cron_logs(cron_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_logs_status
  ON public.cron_logs(status) WHERE status != 'success';

ALTER TABLE public.cron_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only cron_logs" ON public.cron_logs
  USING (auth.role() = 'service_role');

-- Expose via api schema for PostgREST access
CREATE OR REPLACE VIEW api.cron_logs AS SELECT * FROM public.cron_logs;
