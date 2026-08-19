-- Disable RLS on user_profiles - security is at API layer
ALTER TABLE public.user_profiles DISABLE ROW LEVEL SECURITY;

-- Drop all policies on user_profiles (they're useless with RLS disabled)
DROP POLICY IF EXISTS "Lectura de perfil propio" ON public.user_profiles;
DROP POLICY IF EXISTS "Actualizacion de perfil propio" ON public.user_profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "service_role_all_user_profiles" ON public.user_profiles;

-- Simplify trigger to absolute minimum
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, role, trial_ends_at, premium_until, created_at)
  VALUES (NEW.id, NEW.email, 'free', NOW() + INTERVAL '30 days', NOW() + INTERVAL '30 days', NOW())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
