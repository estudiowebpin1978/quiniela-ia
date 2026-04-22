-- SUPER SIMPLE - copy ALL

-- Just delete everything and start fresh
DELETE FROM draws;

-- Add constraint to prevent duplicates
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno);