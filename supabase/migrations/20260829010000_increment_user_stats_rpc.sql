-- Migration: increment_user_stats RPC
-- Incremental update of user_stats (avoids overwriting historical data)

CREATE OR REPLACE FUNCTION public.increment_user_stats(
  p_user_id UUID,
  p_predictions_increment INT DEFAULT 1,
  p_hits_increment INT DEFAULT 0,
  p_is_hit BOOLEAN DEFAULT false,
  p_verified_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_streak INT;
BEGIN
  -- Get current streak
  SELECT COALESCE(current_streak, 0) INTO v_current_streak
  FROM public.user_stats
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    v_current_streak := 0;
  END IF;

  -- Insert or update incrementally
  INSERT INTO public.user_stats (
    user_id, total_predictions, total_hits, current_streak, best_streak, last_verified
  ) VALUES (
    p_user_id,
    p_predictions_increment,
    p_hits_increment,
    CASE WHEN p_is_hit THEN v_current_streak + 1 ELSE 0 END,
    CASE WHEN p_is_hit THEN GREATEST(v_current_streak + 1, 0) ELSE v_current_streak END,
    p_verified_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_predictions = user_stats.total_predictions + p_predictions_increment,
    total_hits = user_stats.total_hits + p_hits_increment,
    current_streak = CASE
      WHEN p_is_hit THEN user_stats.current_streak + 1
      ELSE 0
    END,
    best_streak = GREATEST(
      user_stats.best_streak,
      CASE WHEN p_is_hit THEN user_stats.current_streak + 1 ELSE 0 END
    ),
    last_verified = p_verified_at;
END;
$$;
