-- ============================================================
-- MIGRATION 3: Enable Supabase Realtime
-- ============================================================
-- Pegar en: dashboard.supabase.com > SQL Editor > New query
-- Si da error "already exists", es normal — significa que ya está habilitado
-- ============================================================

-- Enable Realtime on user_predictions (for live verification)
ALTER PUBLICATION supabase_realtime ADD TABLE user_predictions;

-- Enable Realtime on draws (for live source monitoring)
ALTER PUBLICATION supabase_realtime ADD TABLE draws;
