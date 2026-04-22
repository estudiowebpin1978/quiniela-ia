-- Reset and fix - copy each line separately in SQL Editor:

-- Line 1: Delete all
DELETE FROM draws;

-- Line 2: Add constraint (run AFTER delete)
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno);