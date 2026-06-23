-- ============================================
-- CLEANUP: Duplicates + Premium Reset
-- Run in Supabase SQL Editor
-- ============================================

-- STEP 1: See what we're working with
SELECT email, COUNT(*) as cnt, array_agg(id) as ids, array_agg(created_at) as dates
FROM user_profiles
GROUP BY email
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- STEP 2: See all premium/admin users before cleanup
SELECT id, email, role, premium_until
FROM user_profiles
WHERE role IN ('premium', 'admin')
ORDER BY role, email;

-- STEP 3: For each duplicate email, keep the row with the EARLIEST created_at
-- (the original account), delete the rest. Migrate user_predictions first.
DO $$
DECLARE
  rec RECORD;
  keep_id UUID;
  del_id UUID;
  pred_count INT;
BEGIN
  FOR rec IN
    SELECT email, array_agg(id ORDER BY created_at ASC) as ids
    FROM user_profiles
    GROUP BY email
    HAVING COUNT(*) > 1
  LOOP
    keep_id := rec.ids[1];  -- keep oldest
    RAISE NOTICE 'Email: % — keeping %, removing %', rec.email, keep_id, rec.ids[2:];

    -- Move predictions from duplicate IDs to the kept ID
    FOR i IN 2..array_length(rec.ids, 1) LOOP
      del_id := rec.ids[i];

      -- Check if duplicate has predictions
      SELECT COUNT(*) INTO pred_count FROM user_predictions WHERE user_id = del_id;
      IF pred_count > 0 THEN
        RAISE NOTICE '  Moving % predictions from % to %', pred_count, del_id, keep_id;
        UPDATE user_predictions SET user_id = keep_id WHERE user_id = del_id;
      END IF;

      -- Delete duplicate profile
      DELETE FROM user_profiles WHERE id = del_id;
      RAISE NOTICE '  Deleted duplicate profile %', del_id;
    END LOOP;
  END LOOP;
END $$;

-- STEP 4: Remove premium from ALL users except admin and codyroode67@gmail.com
UPDATE user_profiles
SET role = 'free', premium_until = NULL
WHERE role = 'premium'
  AND email NOT IN ('estudiowebpin@gmail.com', 'codyroode67@gmail.com');

-- STEP 5: Verify — show remaining premium/admin users
SELECT id, email, role, premium_until
FROM user_profiles
WHERE role IN ('premium', 'admin')
ORDER BY role, email;

-- STEP 6: Verify — no more duplicates
SELECT email, COUNT(*) as cnt
FROM user_profiles
GROUP BY email
HAVING COUNT(*) > 1;
