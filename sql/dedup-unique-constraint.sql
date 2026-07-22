-- ============================================================
-- Deduplication: Add UNIQUE constraint on draws (date, turno)
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

-- Add UNIQUE constraint
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno, COALESCE(game_id, '00000000-0000-0000-0000-000000000000'));

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_draws_date_turno ON draws (date, turno);
