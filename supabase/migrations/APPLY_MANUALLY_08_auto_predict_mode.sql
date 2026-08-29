-- Migration: Auto-Pilot (Auto-Predict) Mode
-- Adds auto_predict_enabled to user_profiles and creates the processing function.

-- 1. Add auto_predict_enabled column to user_profiles
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS auto_predict_enabled BOOLEAN DEFAULT false;

-- 2. Create RPC to get users with auto-predict enabled for a given turno
-- Called by the cron job before each turno
CREATE OR REPLACE FUNCTION public.get_auto_predict_users(p_turno TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  predictions_used BIGINT,
  premium_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    up.id AS user_id,
    up.email,
    up.role,
    COALESCE(
      (SELECT COUNT(*) FROM public.user_predictions upred 
       WHERE upred.user_id = up.id 
       AND upred.turno = p_turno 
       AND upred.date = CURRENT_DATE::TEXT),
      0
    ) AS predictions_used,
    up.premium_until
  FROM public.user_profiles up
  WHERE up.auto_predict_enabled = true
    AND (up.premium_until IS NULL OR up.premium_until > NOW())
  LIMIT 100; -- Safety cap
END;
$$;

-- 3. Create RPC to toggle auto-predict for a user
CREATE OR REPLACE FUNCTION public.toggle_auto_predict(p_user_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles 
  SET auto_predict_enabled = p_enabled 
  WHERE id = p_user_id;
END;
$$;

-- 4. Log auto-predictions in a tracking table
CREATE TABLE IF NOT EXISTS public.auto_predict_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  turno TEXT NOT NULL,
  date TEXT NOT NULL,
  prediction_id UUID,
  status TEXT DEFAULT 'pending', -- pending, success, limit_reached, error
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_auto_predict_log_user_date 
ON public.auto_predict_log(user_id, date, turno);

-- RLS: only service role can access
ALTER TABLE public.auto_predict_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Service role only auto_predict_log" ON public.auto_predict_log;

CREATE POLICY "Service role only auto_predict_log" ON public.auto_predict_log
  FOR ALL USING (auth.role() = 'service_role');
