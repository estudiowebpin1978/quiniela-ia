-- Phase 5: Transfer payment flow
CREATE TABLE IF NOT EXISTS public.pending_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL CHECK (plan IN ('15_days', '30_days')),
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  whatsapp_sent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID
);

ALTER TABLE public.pending_transfers ENABLE ROW LEVEL SECURITY;

-- Users can read their own transfers
CREATE POLICY "users_read_own_transfers"
  ON public.pending_transfers FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Users can insert their own transfers
CREATE POLICY "users_insert_own_transfers"
  ON public.pending_transfers FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Service role can do everything (admin operations)
CREATE POLICY "service_role_all_transfers"
  ON public.pending_transfers FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Index for admin queries
CREATE INDEX IF NOT EXISTS idx_pending_transfers_status ON public.pending_transfers (status);
CREATE INDEX IF NOT EXISTS idx_pending_transfers_user_id ON public.pending_transfers (user_id);
