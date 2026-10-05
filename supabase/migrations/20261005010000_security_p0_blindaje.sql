-- ============================================================================
-- Auditoría fase P0 — Blindaje de seguridad (2026-10-05)
-- Todas las sentencias son aditivas/idempotentes. Ninguna borra ni reescribe datos.
--
-- Pre-chequeos ejecutados contra producción (2026-10-05):
--   * único caller legítimo de approve_transfer_and_activate_premium =
--     app/api/cron-auto-approve-transfers (service_role). Ningún cliente la usa.
--   * ningún código de la app referencia el schema api (ni schema:"api" ni from("api.*")).
--   * todos los escritores de user_predictions son rutas server-side con service_role.
-- ============================================================================

-- P0-1: la RPC de activación premium era SECURITY DEFINER con EXECUTE a
-- PUBLIC/anon/authenticated → cualquier visitante podía auto-activarse premium
-- sin pagar (verificado en prod: ambos overloads concedidos a anon+authenticated).
-- Se revoca TODO acceso de clientes; conservan postgres y service_role.
DO $$
BEGIN
  IF to_regprocedure('public.approve_transfer_and_activate_premium(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION public.approve_transfer_and_activate_premium(uuid)
      FROM PUBLIC, anon, authenticated;
  END IF;
  IF to_regprocedure('api.approve_transfer_and_activate_premium(uuid)') IS NOT NULL THEN
    REVOKE EXECUTE ON FUNCTION api.approve_transfer_and_activate_premium(uuid)
      FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

-- P0-2: el trigger de protección del perfil congelaba solo role/premium_until.
-- Un usuario autenticado podía hacer PATCH de su propia fila (RLS update-own) y
-- auto-extender trial_ends_at → trial infinito / bypaseo del paywall.
-- Ahora se congelan también trial_started_at, trial_ends_at y email.
-- service_role/postgres (flujos legítimos: webhooks, cron, admin) no se ven afectados.
CREATE OR REPLACE FUNCTION public.protect_premium_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claims text;
BEGIN
  IF current_user IN ('postgres', 'service_role', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  v_claims := current_setting('request.jwt.claims', true);
  IF v_claims IS NOT NULL
     AND coalesce((v_claims::json ->> 'role'), '') = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.role := OLD.role;
  NEW.premium_until := OLD.premium_until;
  NEW.trial_started_at := OLD.trial_started_at;
  NEW.trial_ends_at := OLD.trial_ends_at;
  NEW.email := OLD.email;
  RETURN NEW;
END;
$$;

-- P0-3: el schema api tiene 10 GRANT sobre vistas/funciones a anon/authenticated.
-- Al ser vistas "security owner", saltaban RLS de las tablas subyacentes.
-- Ningún cliente de la app usa el schema api (verificado) → se revoca el acceso
-- de clientes; service_role y postgres conservan todo.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'api'
      AND c.relkind IN ('r', 'v', 'm', 'p', 'f')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE api.%I FROM anon, authenticated', r.relname);
  END LOOP;

  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'api'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated', r.sig);
  END LOOP;
END $$;

-- P0-4: ninguna ruta cliente escribe user_predictions (todo server-side con
-- service_role), pero 4 políticas permitían UPDATE propio → un usuario podía
-- forzar status='WON'/aciertos en sus predicciones. Se eliminan las vías de
-- UPDATE del cliente. Se conservan SELECT/INSERT/DELETE propios (políticas
-- redundantes verificadas: quedan 3 SELECT, 4 INSERT y 2 DELETE propias) y las
-- políticas de service_role.
DROP POLICY IF EXISTS "Users update own predictions" ON public.user_predictions;
DROP POLICY IF EXISTS "users_update_own_predictions" ON public.user_predictions;
DROP POLICY IF EXISTS "predictions_self_all" ON public.user_predictions;
DROP POLICY IF EXISTS "users_own_predictions" ON public.user_predictions;
