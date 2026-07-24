-- ============================================================================
-- 07-indexes.sql: Performance indexes (fully idempotent)
-- ============================================================================

-- DRAWS
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date_desc ON draws (game_id, turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_game_date_turno ON draws (game_id, date, turno);
CREATE INDEX IF NOT EXISTS idx_draws_turno_date ON draws (turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_turno_date_numbers ON draws (turno, date DESC) INCLUDE (numbers);

-- USER_PREDICTIONS
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date ON user_predictions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_turno ON user_predictions (user_id, turno, date DESC);

-- PREDICTION_HISTORY
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date ON prediction_history (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_prediction_history_game_date ON prediction_history (game_id, date DESC);

-- USER_PROFILES
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles (email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles (role);

-- TURN_ANALYTICS
CREATE INDEX IF NOT EXISTS idx_turn_analytics_game_turno_fecha ON turn_analytics (game_id, turno, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha ON turn_analytics (turno, fecha DESC);

-- BACKTEST_RESULTS
CREATE INDEX IF NOT EXISTS idx_backtest_game_turno_model_date ON backtest_results (game_id, turno, model_type, test_date DESC);

-- ML_MODELS
CREATE INDEX IF NOT EXISTS idx_ml_models_game_turno ON ml_models (game_id, turno);

-- MOTOR_PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_motor_performance_game_turno ON motor_performance (game_id, turno);
CREATE INDEX IF NOT EXISTS idx_motor_performance_accuracy ON motor_performance (accuracy DESC);
