-- Migration: Fix predictions_cache RLS — CRITICAL security fix
-- The old policy "Anyone can read predictions cache" with USING (true)
-- allowed ANY user (including anonymous) to read premium data (3/4 cifras)
-- directly from Supabase REST API. This blocks that vector.

-- 1. Drop the dangerously permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read predictions cache" ON public.predictions_cache;

-- 2. Replace with service_role-only read policy
-- The GET /api/predictions handler uses supabaseAdmin (service_role key)
-- which bypasses RLS. No user-facing client should query this table directly.
CREATE POLICY "service_role_read_predictions_cache"
  ON public.predictions_cache FOR SELECT
  USING (auth.role() = 'service_role');

-- 3. Verify: only service_role can INSERT/UPDATE (already exists, but ensure it)
-- The existing "Service role can insert/update predictions cache" policy is correct.
-- No changes needed for INSERT/UPDATE.
