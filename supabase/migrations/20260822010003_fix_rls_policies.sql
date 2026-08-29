-- Clean up duplicate RLS policies on user_profiles
DROP POLICY IF EXISTS "Service role all user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "Service role can do anything" ON user_profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users read own profile" ON user_profiles;
DROP POLICY IF EXISTS "Users update own profile" ON user_profiles;
DROP POLICY IF EXISTS "owner_read_profile" ON user_profiles;
DROP POLICY IF EXISTS "owner_update_profile" ON user_profiles;
DROP POLICY IF EXISTS "profiles_self_select" ON user_profiles;
DROP POLICY IF EXISTS "profiles_self_update" ON user_profiles;
DROP POLICY IF EXISTS "service_delete_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_role_all_user_profiles" ON user_profiles;
DROP POLICY IF EXISTS "service_write_profile" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_read" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_self_select" ON user_profiles;
DROP POLICY IF EXISTS "user_profiles_self_update" ON user_profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON user_profiles;
DROP POLICY IF EXISTS "service_role_all" ON user_profiles;
DROP POLICY IF EXISTS "users_select_own" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own" ON user_profiles;

-- Recreate clean policies
CREATE POLICY "service_role_all" ON user_profiles FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "users_select_own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- Force PostgREST schema reload
NOTIFY pgrst, 'reload schema';
