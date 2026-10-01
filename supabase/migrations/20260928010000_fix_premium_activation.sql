-- Fix activación automática de premium:
-- 1) RPC en schema public (el cron llama supabase.rpc() sin prefijo → buscaba en public y no existía)
-- 2) Usa tablas public calificadas (la versión en api() resolvía la vista api.pending_transfers y fallaba con 42501)
-- 3) 'failed' viola el CHECK de pending_transfers → ahora 'rejected'
-- 4) Trigger que protege role/premium_until contra escalada de privilegios vía UPDATE propio

CREATE OR REPLACE FUNCTION public.approve_transfer_and_activate_premium(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_transfer record;
  v_plan_days integer;
  v_premium_until timestamptz;
  v_current_premium timestamptz;
BEGIN
  SELECT id, user_id, plan, amount
  INTO v_transfer
  FROM public.pending_transfers
  WHERE id = p_transfer_id
    AND status = 'pending'
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'not_found_or_already_processed',
      'transfer_id', p_transfer_id
    );
  END IF;

  v_plan_days := CASE v_transfer.plan
    WHEN '15_days' THEN 15
    WHEN '30_days' THEN 30
    ELSE NULL
  END;

  IF v_plan_days IS NULL THEN
    UPDATE public.pending_transfers
    SET status = 'rejected', reviewed_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_plan',
      'plan', v_transfer.plan,
      'transfer_id', p_transfer_id
    );
  END IF;

  SELECT premium_until INTO v_current_premium
  FROM public.user_profiles
  WHERE id = v_transfer.user_id;

  IF v_current_premium IS NOT NULL AND v_current_premium > now() THEN
    v_premium_until := v_current_premium + (v_plan_days || ' days')::interval;
  ELSE
    v_premium_until := now() + (v_plan_days || ' days')::interval;
  END IF;

  UPDATE public.user_profiles
  SET role = 'premium', premium_until = v_premium_until
  WHERE id = v_transfer.user_id;

  UPDATE public.pending_transfers
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_transfer_id;

  INSERT INTO public.notifications (user_id, type, title, body, data)
  VALUES (
    v_transfer.user_id,
    'premium_activated',
    'Premium activado',
    'Tu plan ' || replace(v_transfer.plan, '_', ' ') || ' fue activado por transferencia.',
    jsonb_build_object(
      'plan', v_transfer.plan,
      'method', 'transfer_auto_approve'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'transfer_id', v_transfer.id,
    'user_id', v_transfer.user_id,
    'plan', v_transfer.plan,
    'premium_until', v_premium_until
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_transfer_and_activate_premium(uuid) TO service_role, authenticated;

-- Protege role/premium_until: solo service_role/postgres pueden modificarlos.
-- Cualquier UPDATE vía anon/authenticated (PostgREST con la propia fila) conserva los valores.
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_premium_fields ON public.user_profiles;
CREATE TRIGGER trg_protect_premium_fields
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_premium_fields();

-- notifications.type no permitía 'premium_activated' (revertía la transacción de la RPC
-- y también la aprobación manual desde /api/admin/transfers)
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'draw_loaded'::text, 'prediction_won'::text, 'prediction_lost'::text,
    'trial_expiring'::text, 'premium_expiring'::text, 'system'::text,
    'premium_activated'::text
  ]));
