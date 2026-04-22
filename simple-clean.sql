-- Simplified version - copy ALL this to SQL Editor:

-- 1. Delete ALL draws (start fresh)
DELETE FROM draws;

-- 2. Add unique constraint  
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno);