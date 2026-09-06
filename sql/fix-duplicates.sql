-- 1. Count duplicates
SELECT prediction_id, COUNT(*) as cnt 
FROM prediction_history 
GROUP BY prediction_id 
HAVING COUNT(*) > 1 
ORDER BY cnt DESC;

-- 2. Check constraints on prediction_history
SELECT conname, contype, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'prediction_history'::regclass;

-- 3. Get trigger function code
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'verify_user_predictions_after_draw';

-- 4. Check triggers on official_draws
SELECT trigger_name, event_manipulation, action_timing, action_statement, tgenabled
FROM pg_trigger 
WHERE tgrelid = 'official_draws'::regclass;

-- 5. Delete duplicates (keep earliest)
DELETE FROM prediction_history 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM prediction_history 
  GROUP BY prediction_id
);

-- 6. Add unique constraint if missing
ALTER TABLE prediction_history 
ADD CONSTRAINT prediction_history_prediction_id_unique 
UNIQUE (prediction_id);

-- 7. Verify no more duplicates
SELECT prediction_id, COUNT(*) as cnt 
FROM prediction_history 
GROUP BY prediction_id 
HAVING COUNT(*) > 1;
