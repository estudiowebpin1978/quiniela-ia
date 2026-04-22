-- SIMPLE VERSION - copy ALL to SQL Editor

-- 1. Keep only ONE record per date+turno
DELETE FROM draws WHERE id NOT IN (
  SELECT DISTINCT ON (date, turno) id FROM draws ORDER BY date, turno, created_at
);

-- 2. Add unique constraint
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno);