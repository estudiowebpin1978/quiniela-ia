-- ============================================================
-- ENABLE REALTIME: user_predictions table for live verification
-- ============================================================

-- Add user_predictions to the supabase_realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE user_predictions;

-- Also enable draws for live source monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE draws;
