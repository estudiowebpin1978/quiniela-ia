-- ============================================================
-- Deduplication: Add UNIQUE constraint on draws (date, turno, game_id)
-- Prevents duplicate rows when using resolution=merge-duplicates
-- Run after multi-game-schema.sql
-- ============================================================

-- Remove any existing duplicates before adding constraint
DELETE FROM draws a
USING draws b
WHERE a.id < b.id
  AND a.date = b.date
  AND a.turno = b.turno
  AND a.game_id IS NOT DISTINCT FROM b.game_id;

-- Ensure game_id is NOT NULL for constraint to work (backfill NULLs)
UPDATE draws SET game_id = '00000000-0000-0000-0000-000000000000' WHERE game_id IS NULL;

-- Add UNIQUE constraint (now game_id is NOT NULL)
ALTER TABLE draws ALTER COLUMN game_id SET NOT NULL;
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno, game_id);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_draws_date_turno ON draws (date, turno);
