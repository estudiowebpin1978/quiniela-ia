-- =============================================================
-- FIX: Add UNIQUE constraint on user_predictions(user_id, date, turno)
-- Prevents TOCTOU race condition in duplicate prediction check.
-- =============================================================

-- Add unique constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_predictions_user_date_turno_key'
  ) THEN
    ALTER TABLE user_predictions
      ADD CONSTRAINT user_predictions_user_date_turno_key
      UNIQUE (user_id, date, turno);
  END IF;
END $$;
