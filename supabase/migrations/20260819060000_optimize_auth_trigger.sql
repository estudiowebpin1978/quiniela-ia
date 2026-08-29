-- 1. OPTIMIZACIÓN DE LA FUNCIÓN TRIGGER DE CREACIÓN DE USUARIOS
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_profiles (
    id,
    email,
    role,
    trial_ends_at,
    premium_until,
    created_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    'free',
    NOW() + INTERVAL '30 days',
    NOW() + INTERVAL '30 days',
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Retorna el usuario sin bloquear la autenticación si falla la tabla auxiliar
    RETURN NEW;
END;
$$;

-- Recrear Trigger de forma limpia
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. RESTRUCTURACIÓN DE RLS EN user_profiles (Cero Recursividad)
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas previas
DROP POLICY IF EXISTS "Users can view own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Lectura de perfil propio" ON public.user_profiles;
DROP POLICY IF EXISTS "Actualizacion de perfil propio" ON public.user_profiles;
DROP POLICY IF EXISTS "users_read_own_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "users_update_own_profile" ON public.user_profiles;
DROP POLICY IF EXISTS "service_role_all_user_profiles" ON public.user_profiles;

-- Política de lectura ultrarrápida
CREATE POLICY "Lectura de perfil propio"
  ON public.user_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

-- Política de actualización protegida
CREATE POLICY "Actualizacion de perfil propio"
  ON public.user_profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

-- 3. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_profiles_id ON public.user_profiles USING btree (id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.user_profiles (role);
