-- Drop existing policies and recreate
DROP POLICY IF EXISTS "Allow insert" ON sync_logs;
DROP POLICY IF EXISTS "Allow read" ON sync_logs;

-- Allow insert from service role
CREATE POLICY "Allow insert" ON sync_logs
  FOR INSERT TO service_role
  WITH CHECK (true);

-- Allow read for all
CREATE POLICY "Allow read" ON sync_logs
  FOR SELECT TO anon, authenticated
  USING (true);