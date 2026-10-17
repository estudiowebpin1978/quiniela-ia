-- P0 security hardening: remove client-side write and TRUNCATE privileges from
-- lottery results and Brinco prediction tables. RLS policies remain in place.
-- Public read access to the shared `draws` table is preserved.
--
-- Verified against the linked database on 2026-10-17:
-- anon/authenticated had table-wide privileges on these tables, and `draws`
-- had an ALL policy with USING (true). TRUNCATE bypasses row-level policies.
--
-- Rollback (restores the previous grants; this reopens client write access):
--   GRANT ALL PRIVILEGES ON TABLE public.draws TO anon, authenticated;
--   GRANT ALL PRIVILEGES ON TABLE public.brinco_draws TO anon, authenticated;
--   GRANT ALL PRIVILEGES ON TABLE public.brinco_predictions TO anon, authenticated;
--   ALTER POLICY draws_write ON public.draws TO PUBLIC USING (true) WITH CHECK (true);

BEGIN;

REVOKE ALL PRIVILEGES ON TABLE public.draws
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.draws TO anon, authenticated;

-- A permissive ALL policy named draws_write existed outside the migration
-- history. Restrict it as defense in depth; table grants are revoked below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'draws'
      AND policyname = 'draws_write'
  ) THEN
    EXECUTE 'ALTER POLICY draws_write ON public.draws TO service_role USING (true) WITH CHECK (true)';
  END IF;
END $$;

REVOKE ALL PRIVILEGES ON TABLE public.brinco_draws
  FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.brinco_predictions
  FROM PUBLIC, anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE public.draws TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.brinco_draws TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.brinco_predictions TO service_role;

COMMIT;
