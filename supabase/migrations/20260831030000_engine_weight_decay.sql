-- ═══════════════════════════════════════════════════════════════════
-- DECAY FUNCTION: Historical decay for meta-ensemble engine weights
-- ═══════════════════════════════════════════════════════════════════

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'engine_performance' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE engine_performance ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    UPDATE engine_performance SET updated_at = NOW() WHERE updated_at IS NULL;
  END IF;
END $$;

-- Calculate time-decayed win rate for each engine
-- Formula: final_weight = raw_rate * e^(-0.1 * days_since_update)
-- λ=0.1 means half-life ≈ 7 days (recent results count more)
CREATE OR REPLACE FUNCTION calculate_engine_weights_decayed(
  p_turno TEXT
)
RETURNS TABLE (
  engine_name TEXT,
  raw_rate NUMERIC,
  days_since_update NUMERIC,
  decay_factor NUMERIC,
  final_weight NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
SELECT
  ep.engine_name,
  ROUND(ep.win_rate_last_10, 4) AS raw_rate,
  ROUND(EXTRACT(EPOCH FROM (NOW() - COALESCE(ep.updated_at, NOW()))) / 86400, 2) AS days_since_update,
  ROUND(EXP(-0.1 * GREATEST(EXTRACT(EPOCH FROM (NOW() - COALESCE(ep.updated_at, NOW()))) / 86400, 0)), 4) AS decay_factor,
  ROUND(
    GREATEST(0, LEAST(1,
      ep.win_rate_last_10 * EXP(-0.1 * GREATEST(EXTRACT(EPOCH FROM (NOW() - COALESCE(ep.updated_at, NOW()))) / 86400, 0))
    )),
    4
  ) AS final_weight
FROM engine_performance ep
WHERE ep.turno = p_turno;
$$;
