-- ============================================================
-- MIGRATION 2: Circuit Breaker - Source Health Tracking
-- ============================================================
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- ============================================================

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  quarantined_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  total_failures INT NOT NULL DEFAULT 0,
  total_successes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE source_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only" ON source_health
  USING (auth.role() = 'service_role');

CREATE INDEX IF NOT EXISTS idx_source_health_quarantined
  ON source_health (quarantined_until)
  WHERE quarantined_until IS NOT NULL;

CREATE OR REPLACE FUNCTION is_source_quarantined(p_source TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_until TIMESTAMPTZ;
BEGIN
  SELECT quarantined_until INTO v_until
  FROM source_health WHERE source = p_source;
  IF v_until IS NULL THEN RETURN FALSE; END IF;
  RETURN v_until > NOW();
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_source_health()
RETURNS TABLE (
  source TEXT, consecutive_failures INT, quarantined_until TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ, last_success_at TIMESTAMPTZ,
  total_failures INT, total_successes INT, success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT sh.source, sh.consecutive_failures, sh.quarantined_until,
    sh.last_failure_at, sh.last_success_at, sh.total_failures, sh.total_successes,
    CASE WHEN (sh.total_failures + sh.total_successes) > 0
      THEN ROUND(sh.total_successes::NUMERIC / (sh.total_failures + sh.total_successes) * 100, 1)
      ELSE 0 END AS success_rate
  FROM source_health sh ORDER BY sh.source;
END;
$$ LANGUAGE plpgsql STABLE;
