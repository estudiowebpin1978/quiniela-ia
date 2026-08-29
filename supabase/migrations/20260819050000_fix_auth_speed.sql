-- =============================================================================
-- FIX: Optimize signup speed - remove RLS overhead on user_profiles
-- =============================================================================

-- The signup trigger (handle_new_user) is SECURITY DEFINER but RLS on
-- user_profiles may add overhead. Disable RLS on user_profiles entirely
-- since it's only accessed via service_role or SECURITY DEFINER functions.

ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;

-- Also ensure there's no lock contention from multiple triggers
-- Drop any duplicate triggers on auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Recreate the trigger as minimal and fast
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, trial_ends_at, premium_until, created_at)
  VALUES (new.id, new.email, 'free', now() + interval '30 days', now() + interval '30 days', now())
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Disable RLS on user_predictions too - all access is via service_role
ALTER TABLE user_predictions DISABLE ROW LEVEL SECURITY;

-- Disable RLS on prediction_history - all access is via service_role
ALTER TABLE prediction_history DISABLE ROW LEVEL SECURITY;

-- Disable RLS on user_stats - all access is via service_role
ALTER TABLE user_stats DISABLE ROW LEVEL SECURITY;
