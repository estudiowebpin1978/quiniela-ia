-- ============================================================================
-- Auto-Pilot (Auto-Predict) Mode
-- CONVERTIDO desde APPLY_MANUALLY_08_auto_predict_mode.sql
-- (auditoría 2026-10-05: los APPLY_MANUALLY_* no son migraciones versionadas;
--  la CLI nunca los aplica porque el nombre no cumple <timestamp>_name.sql)
--
-- Idempotente: pensada para aplicarse SOBRE PRODUCCIÓN, donde el contenido YA
-- existe (columna, tabla, índices, RPCs y política) → todo es no-op seguro:
--   * ADD COLUMN / CREATE TABLE / CREATE INDEX → IF NOT EXISTS
--   * RPCs → CREATE OR REPLACE (firma idéntica a la vigente en prod)
--   * RLS → ENABLE (ya habilitado) + DROP POLICY IF EXISTS + CREATE POLICY
--
-- Timestamp backdated a 2026-08-29 09:00 para ordenar ANTES de:
--   * 20260830000000_fix_auto_predict_rpc_type.sql (redefine get_auto_predict_users;
--     aquí ya se incluye la comparación corregida upred.date = CURRENT_DATE)
--   * 20260831020000_hyper_optimization_indexes_rpcs.sql (cleanup_old_logs hace
--     DELETE FROM auto_predict_log → requiere que la tabla exista)
-- ============================================================================

-- 1. Columna de preferencia en user_profiles
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS auto_predict_enabled BOOLEAN DEFAULT false;

-- 2. RPC: usuarios con auto-predict activo para un turno (la llama el cron antes de cada turno)
CREATE OR REPLACE FUNCTION public.get_auto_predict_users(p_turno TEXT)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  role TEXT,
  predictions_used BIGINT,
  premium_until TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    up.id AS user_id,
    up.email,
    up.role,
    COALESCE(
      (SELECT COUNT(*) FROM public.user_predictions upred
       WHERE upred.user_id = up.id
         AND upred.turno = p_turno
         AND upred.date = CURRENT_DATE),
      0
    ) AS predictions_used,
    up.premium_until
  FROM public.user_profiles up
    WHERE up.auto_predict_enabled = true
    AND (up.premium_until IS NULL OR up.premium_until > NOW())
  LIMIT 100; -- Safety cap
END;
$$;

-- 3. RPC: activar/desactivar auto-predict para un usuario
CREATE OR REPLACE FUNCTION public.toggle_auto_predict(p_user_id UUID, p_enabled BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.user_profiles
  SET auto_predict_enabled = p_enabled
  WHERE id = p_user_id;
END;
$$;

-- 4. Tabla de log de predicciones automáticas
CREATE TABLE IF NOT EXISTS public.auto_predict_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  turno TEXT NOT NULL,
  date TEXT NOT NULL,
  prediction_id UUID,
  status TEXT DEFAULT 'pending', -- pending, success, limit_reached, error
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auto_predict_log_user_date
  ON public.auto_predict_log(user_id, date, turno);

-- 5. RLS: solo service_role (misma semántica que el fichero original, pero con
--    auth.jwt()->>'role', convención del repo desde 20260831010000_fix_rls_deprecated_auth_role.sql)
ALTER TABLE public.auto_predict_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only auto_predict_log" ON public.auto_predict_log;

CREATE POLICY "Service role only auto_predict_log" ON public.auto_predict_log
  FOR ALL USING (auth.jwt()->>'role' = 'service_role');
