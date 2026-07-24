-- ============================================================================
-- 07-indexes.sql: Performance indexes for production
-- Ejecutar DESPUÉS de 06-rls-policies.sql
-- ============================================================================

-- ============================================================================
-- 1. DRAWS - Composite indexes for RPC window queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date_desc
  ON draws (game_id, turno, date DESC);

CREATE INDEX IF NOT EXISTS idx_draws_game_date_turno
  ON draws (game_id, date, turno);

CREATE INDEX IF NOT EXISTS idx_draws_date_turno
  ON draws (date, turno);

CREATE INDEX IF NOT EXISTS idx_draws_turno_date_numbers
  ON draws (turno, date DESC)
  INCLUDE (numbers);

CREATE INDEX IF NOT EXISTS idx_draws_game_date_numbers
  ON draws (game_id, date DESC)
  INCLUDE (numbers);

-- ============================================================================
-- 2. USER_PREDICTIONS - Lookup and pagination
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date
  ON user_predictions (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_predictions_user_turno
  ON user_predictions (user_id, turno, date DESC);

CREATE INDEX IF NOT EXISTS idx_user_predictions_date_turno
  ON user_predictions (date, turno);

-- ============================================================================
-- 3. PREDICTION_HISTORY - Verification queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date
  ON prediction_history (user_id, date DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_history_date_turno
  ON prediction_history (date, turno);

CREATE INDEX IF NOT EXISTS idx_prediction_history_game_date
  ON prediction_history (game_id, date DESC);

-- ============================================================================
-- 4. USER_PROFILES - Auth and tier lookups
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_user_profiles_email
  ON user_profiles (email);

CREATE INDEX IF NOT EXISTS idx_user_profiles_role
  ON user_profiles (role);

CREATE INDEX IF NOT EXISTS idx_user_profiles_premium_until
  ON user_profiles (premium_until);

-- ============================================================================
-- 5. TURN_ANALYTICS - Latest analytics per turno
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha
  ON turn_analytics (turno, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_turn_analytics_game_turno_fecha
  ON turn_analytics (game_id, turno, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha_calc
  ON turn_analytics (turno, fecha_calculo DESC);

-- ============================================================================
-- 6. BACKTEST_RESULTS - Query and aggregation
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_backtest_game_turno_model_date
  ON backtest_results (game_id, turno, model_type, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_turno_model_date
  ON backtest_results (turno, model_type, test_date DESC);

CREATE INDEX IF NOT EXISTS idx_backtest_test_date
  ON backtest_results (test_date DESC);

-- ============================================================================
-- 7. ML_MODELS - Model lookup
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ml_models_game_turno
  ON ml_models (game_id, turno);

CREATE INDEX IF NOT EXISTS idx_ml_models_turno_updated
  ON ml_models (turno, updated_at DESC);

-- ============================================================================
-- 8. ML_DL_MODELS - DL model lookup
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ml_dl_models_game_turno
  ON ml_dl_models (game_id, turno);

-- ============================================================================
-- 9. MOTOR_PERFORMANCE - Motor accuracy queries
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_motor_performance_game_turno
  ON motor_performance (game_id, turno);

CREATE INDEX IF NOT EXISTS idx_motor_performance_motor_turno
  ON motor_performance (motor, turno);

CREATE INDEX IF NOT EXISTS idx_motor_performance_accuracy
  ON motor_performance (accuracy DESC);

-- ============================================================================
-- 10. UNIQUE CONSTRAINTS (idempotency)
-- ============================================================================
ALTER TABLE draws
DROP CONSTRAINT IF EXISTS draws_unique_date_turno_game;

ALTER TABLE draws
ADD CONSTRAINT draws_unique_date_turno_game
UNIQUE (game_id, date, turno);
