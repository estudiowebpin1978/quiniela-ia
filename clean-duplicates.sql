-- Run this in Supabase SQL Editor (copy-paste all)

-- 1. Create function to delete duplicates
CREATE OR REPLACE FUNCTION public.delete_draw_duplicates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM draws 
  WHERE id NOT IN (
    SELECT MIN(id)::uuid 
    FROM draws 
    GROUP BY date, turno 
  );
END;
$$;

-- 2. Run it
SELECT public.delete_draw_duplicates();

-- 3. Add unique constraint to prevent future duplicates
ALTER TABLE draws ADD CONSTRAINT draws_date_turno_key UNIQUE (date, turno);