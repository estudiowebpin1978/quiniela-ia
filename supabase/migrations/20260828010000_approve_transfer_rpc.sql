-- Atomic transfer approval + premium activation RPC
-- Uses FOR UPDATE SKIP LOCKED to prevent concurrent cron collisions
-- All writes (transfer status, premium_until, notification) are in one transaction

CREATE OR REPLACE FUNCTION api.approve_transfer_and_activate_premium(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_transfer record;
  v_plan_days integer;
  v_premium_until timestamptz;
  v_current_premium timestamptz;
BEGIN
  -- 1. Lock the transfer row (SKIP LOCKED prevents concurrent cron collisions)
  SELECT id, user_id, plan, amount
  INTO v_transfer
  FROM pending_transfers
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

  -- 2. Validate plan
  v_plan_days := CASE v_transfer.plan
    WHEN '15_days' THEN 15
    WHEN '30_days' THEN 30
    ELSE NULL
  END;

  IF v_plan_days IS NULL THEN
    UPDATE pending_transfers
    SET status = 'failed', reviewed_at = now()
    WHERE id = p_transfer_id;

    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'invalid_plan',
      'plan', v_transfer.plan,
      'transfer_id', p_transfer_id
    );
  END IF;

  -- 3. Calculate premium_until (extend if already active)
  SELECT premium_until INTO v_current_premium
  FROM user_profiles
  WHERE id = v_transfer.user_id;

  IF v_current_premium IS NOT NULL AND v_current_premium > now() THEN
    v_premium_until := v_current_premium + (v_plan_days || ' days')::interval;
  ELSE
    v_premium_until := now() + (v_plan_days || ' days')::interval;
  END IF;

  -- 4. Activate premium (atomic with transfer status update)
  UPDATE user_profiles
  SET role = 'premium', premium_until = v_premium_until
  WHERE id = v_transfer.user_id;

  -- 5. Mark transfer as approved
  UPDATE pending_transfers
  SET status = 'approved', reviewed_at = now()
  WHERE id = p_transfer_id;

  -- 6. Create notification (same transaction — rolls back if anything above fails)
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (
    v_transfer.user_id,
    'premium_activated',
    'Premium activado',
    'Tu plan ' || replace(v_transfer.plan, '_', ' ') || ' fue activado por transferencia.',
    jsonb_build_object(
      'plan', v_transfer.plan,
      'method', 'transfer_auto_approve'
    )::text
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
