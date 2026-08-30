-- Fix: get_auto_predict_users RPC — type mismatch date = text
-- user_predictions.date is DATE, CURRENT_DATE::TEXT is TEXT → operator does not exist
-- Root cause of cron-auto-predict failures with "[object Object]"

CREATE OR REPLACE FUNCTION public.get_auto_predict_users(p_turno text)
 RETURNS TABLE(user_id uuid, email text, role text, predictions_used bigint, premium_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;
