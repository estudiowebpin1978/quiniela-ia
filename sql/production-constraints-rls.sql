-- ============================================================================
-- MIGRACIÓN: Constraints, RLS e Índices de Producción
-- Ejecutar en Supabase SQL Editor DESPUÉS de rpc-heavy-calculations.sql
-- ============================================================================

-- ============================================================================
-- 1. CONSTRAINT ÚNICA EN DRAWS (evita duplicados por fecha/turno/juego)
-- ============================================================================
ALTER TABLE draws 
DROP CONSTRAINT IF EXISTS draws_unique_date_turno_game;

ALTER TABLE draws 
ADD CONSTRAINT draws_unique_date_turno_game 
UNIQUE (date, turno, game_id);

-- ============================================================================
-- 2. ÍNDICES COMPUESTOS PARA RPCs DE VENTANA TEMPORAL
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date_desc 
ON draws (game_id, turno, date DESC);

CREATE INDEX IF NOT EXISTS idx_draws_game_date_turno 
ON draws (game_id, date, turno);

CREATE INDEX IF NOT EXISTS idx_draws_date_turno 
ON draws (date, turno);

-- Para turn_analytics
CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha_calc 
ON turn_analytics (turno, fecha_calculo DESC);

-- Para backtest_results
CREATE INDEX IF NOT EXISTS idx_backtest_turno_model_date 
ON backtest_results (turno, model_type, test_date DESC);

-- Para ml_models
CREATE INDEX IF NOT EXISTS idx_ml_models_turno_updated 
ON ml_models (turno, updated_at DESC);

-- ============================================================================
-- 3. HABILITAR RLS EN TABLAS CRÍTICAS
-- ============================================================================

-- backtest_results
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_backtest" ON backtest_results;
DROP POLICY IF EXISTS "authenticated_read_backtest" ON backtest_results;
CREATE POLICY "service_write_backtest" ON backtest_results
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_backtest" ON backtest_results
  FOR SELECT USING (auth.role() = 'authenticated');

-- turn_analytics
ALTER TABLE turn_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_turn_analytics" ON turn_analytics;
DROP POLICY IF EXISTS "authenticated_read_turn_analytics" ON turn_analytics;
CREATE POLICY "service_write_turn_analytics" ON turn_analytics
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_turn_analytics" ON turn_analytics
  FOR SELECT USING (auth.role() = 'authenticated');

-- ml_models
ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_ml_models" ON ml_models;
DROP POLICY IF EXISTS "authenticated_read_ml_models" ON ml_models;
CREATE POLICY "service_write_ml_models" ON ml_models
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_ml_models" ON ml_models
  FOR SELECT USING (auth.role() = 'authenticated');

-- motor_performance
ALTER TABLE motor_performance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_motor_perf" ON motor_performance;
DROP POLICY IF EXISTS "authenticated_read_motor_perf" ON motor_performance;
CREATE POLICY "service_write_motor_perf" ON motor_performance
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_motor_perf" ON motor_performance
  FOR SELECT USING (auth.role() = 'authenticated');

-- ml_dl_models
ALTER TABLE ml_dl_models ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_write_ml_dl" ON ml_dl_models;
DROP POLICY IF EXISTS "authenticated_read_ml_dl" ON ml_dl_models;
CREATE POLICY "service_write_ml_dl" ON ml_dl_models
  FOR INSERT WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "authenticated_read_ml_dl" ON ml_dl_models
  FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================================================
-- 4. COLUMNAS DE AUDITORÍA EN SCRAPING
-- ============================================================================
ALTER TABLE draws 
ADD COLUMN IF NOT EXISTS html_hash TEXT,
ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(3,2),
ADD COLUMN IF NOT EXISTS source_priority INT DEFAULT 0;

COMMENT ON COLUMN draws.html_hash IS 'SHA256 del HTML crudo para auditoría';
COMMENT ON COLUMN draws.confidence_score IS 'Score de confianza del parser (0.00-1.00)';
COMMENT ON COLUMN draws.source_priority IS 'Prioridad de la fuente (0=primaria, 1=fallback, 2=oficial)';

-- ============================================================================
-- 5. FUNCIÓN DE LIMPIEZA DE CACHÉ ANTIGUO (para cron)
-- ============================================================================
CREATE OR REPLACE FUNCTION clean_old_predictions(p_older_than_days INT DEFAULT 7)
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_deleted INT;
BEGIN
  DELETE FROM user_predictions 
  WHERE created_at < NOW() - (p_older_than_days || ' days')::INTERVAL
    AND id NOT IN (SELECT prediction_id FROM prediction_history);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION clean_old_predictions TO service_role;