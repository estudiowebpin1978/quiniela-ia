-- Capture the draws table schema that was created outside migrations.
-- This migration is idempotent (IF NOT EXISTS) and documents the table
-- that the entire application depends on.

CREATE TABLE IF NOT EXISTS draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  turno TEXT NOT NULL,
  numbers INTEGER[] NOT NULL,
  source TEXT,
  game_id UUID DEFAULT 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'::uuid,
  jurisdiccion TEXT DEFAULT 'nacional',
  html_hash TEXT,
  confidence_score NUMERIC,
  source_priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'draws_date_turno_game_id_key'
  ) THEN
    ALTER TABLE draws ADD CONSTRAINT draws_date_turno_game_id_key UNIQUE (date, turno, game_id);
  END IF;
END $$;

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_draws_turno_date ON draws (turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_game_date ON draws (game_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws (date DESC);

-- RLS: service_role only (draws are written by scrapers, read by engines)
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON draws;
CREATE POLICY "Service role only" ON draws
  USING (auth.role() = 'service_role');

-- Grant access
GRANT ALL ON draws TO service_role;
