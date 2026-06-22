-- Run this in Supabase SQL Editor to fix existing users missing from user_profiles
-- This creates user_profiles rows for any auth.users that don't have one

INSERT INTO user_profiles (id, email, role)
SELECT 
  au.id,
  au.email,
  'free'
FROM auth.users au
LEFT JOIN user_profiles up ON au.id = up.id
WHERE up.id IS NULL;

-- Then, for the test user who paid but didn't get premium:
-- UPDATE user_profiles 
-- SET role = 'premium', premium_until = NOW() + INTERVAL '7 days'
-- WHERE email = 'deep666web@gmail.com';
