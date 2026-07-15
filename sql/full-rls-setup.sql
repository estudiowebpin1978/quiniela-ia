-- ============================================================
-- MIGRACIÓN SEGURA: Crear tablas + RLS para service_role
-- Ejecutar UNA sola vez en: Supabase Dashboard > SQL Editor
-- ============================================================

-- === 1. ml_models ===
CREATE TABLE IF NOT EXISTS ml_models (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL UNIQUE,
  modelos JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_models_turno ON ml_models(turno);

ALTER TABLE ml_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON ml_models;
CREATE POLICY "Service role only" ON ml_models FOR ALL USING (auth.role() = 'service_role');

-- === 2. ml_dl_models ===
CREATE TABLE IF NOT EXISTS ml_dl_models (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL UNIQUE,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ml_dl_models_turno ON ml_dl_models(turno);

ALTER TABLE ml_dl_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON ml_dl_models;
CREATE POLICY "Service role only" ON ml_dl_models FOR ALL USING (auth.role() = 'service_role');

-- === 3. motor_performance ===
CREATE TABLE IF NOT EXISTS motor_performance (
  id BIGSERIAL PRIMARY KEY,
  motor TEXT NOT NULL,
  turno TEXT NOT NULL,
  accuracy NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  times_used INTEGER NOT NULL DEFAULT 0,
  last_used TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (motor, turno)
);
CREATE INDEX IF NOT EXISTS idx_motor_performance_turno ON motor_performance (turno);

ALTER TABLE motor_performance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only" ON motor_performance;
CREATE POLICY "Service role only" ON motor_performance FOR ALL USING (auth.role() = 'service_role');

-- === 4. user_gamification ===
CREATE TABLE IF NOT EXISTS user_gamification (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  last_active_date DATE,
  total_analyses INTEGER DEFAULT 0,
  total_saves INTEGER DEFAULT 0,
  total_compares INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role all user_gamification" ON user_gamification;
CREATE POLICY "Service role all user_gamification" ON user_gamification FOR ALL USING (auth.role() = 'service_role');

-- === 5. user_achievements ===
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role all user_achievements" ON user_achievements;
CREATE POLICY "Service role all user_achievements" ON user_achievements FOR ALL USING (auth.role() = 'service_role');

-- === 6. community_trends ===
CREATE TABLE IF NOT EXISTS community_trends (
  date DATE NOT NULL,
  turno TEXT NOT NULL,
  hot_numbers JSONB DEFAULT '[]'::jsonb,
  hot_correlations JSONB DEFAULT '[]'::jsonb,
  analysis_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, turno)
);

ALTER TABLE community_trends ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role all community_trends" ON community_trends;
CREATE POLICY "Service role all community_trends" ON community_trends FOR ALL USING (auth.role() = 'service_role');

-- === 7. prediction_history ===
CREATE TABLE IF NOT EXISTS prediction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID,
  user_id UUID REFERENCES auth.users(id),
  fecha DATE NOT NULL,
  turno TEXT NOT NULL,
  numeros_2 TEXT[] DEFAULT '{}',
  numeros_3 TEXT[] DEFAULT '{}',
  numeros_4 TEXT[] DEFAULT '{}',
  resultado_oficial INT[] DEFAULT '{}',
  aciertos_2 JSONB DEFAULT '[]',
  aciertos_3 JSONB DEFAULT '[]',
  aciertos_4 JSONB DEFAULT '[]',
  total_aciertos INT DEFAULT 0,
  verified BOOLEAN DEFAULT TRUE,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_prediction_history_prediction_id ON prediction_history (prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_history_fecha_turno ON prediction_history (fecha, turno);
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_id ON prediction_history (user_id);

ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only prediction_history" ON prediction_history;
CREATE POLICY "Service role only prediction_history" ON prediction_history FOR ALL USING (auth.role() = 'service_role');

-- === 8. user_stats ===
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  total_predictions INT DEFAULT 0,
  total_hits INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_verified TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only user_stats" ON user_stats;
CREATE POLICY "Service role only user_stats" ON user_stats FOR ALL USING (auth.role() = 'service_role');

-- === 9. Functions (idempotent) ===
CREATE OR REPLACE FUNCTION update_motor_performance(
  p_motor TEXT, p_turno TEXT, p_hit_rate NUMERIC
) RETURNS VOID AS $$
BEGIN
  INSERT INTO motor_performance (motor, turno, accuracy, times_used, last_used)
  VALUES (p_motor, p_turno, p_hit_rate, 1, NOW())
  ON CONFLICT (motor, turno) DO UPDATE SET
    accuracy = (motor_performance.accuracy * motor_performance.times_used + p_hit_rate) / (motor_performance.times_used + 1),
    times_used = motor_performance.times_used + 1,
    last_used = NOW(),
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_top_motors(p_turno TEXT, p_count INTEGER DEFAULT 16)
RETURNS TABLE (motor TEXT, accuracy NUMERIC, times_used INTEGER) AS $$
BEGIN
  RETURN QUERY
  SELECT motor, accuracy, times_used
  FROM motor_performance
  WHERE turno = p_turno
  ORDER BY
    CASE WHEN times_used < 3 THEN 0 ELSE 1 END DESC,
    accuracy DESC
  LIMIT p_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_skipped_motors(p_turno TEXT)
RETURNS TABLE (motor TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT motor
  FROM motor_performance
  WHERE turno = p_turno
    AND times_used >= 5
    AND accuracy < 0.3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION should_run_motor(p_motor TEXT, p_turno TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_entry motor_performance%ROWTYPE;
BEGIN
  SELECT * INTO v_entry
  FROM motor_performance
  WHERE motor = p_motor AND turno = p_turno;

  IF NOT FOUND THEN RETURN TRUE; END IF;
  IF v_entry.times_used < 3 THEN RETURN TRUE; END IF;
  IF v_entry.accuracy < 0.3 AND v_entry.times_used >= 5 THEN RETURN FALSE; END IF;
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION clear_old_motor_performance(p_max_age_hours INTEGER DEFAULT 6)
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM motor_performance
  WHERE last_used < NOW() - (p_max_age_hours || ' hours')::INTERVAL;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === DONE ===
-- Todas las tablas creadas con RLS activo y policies restringidas a service_role.
-- Las funciones SQL usan SECURITY DEFINER para ejecutarse con privilegios del owner.

-- === PERFORMANCE: Indexes for draws table (most queried) ===
CREATE INDEX IF NOT EXISTS idx_draws_turno_date ON draws(turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws(date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date_turno ON draws(date, turno);

-- === PERFORMANCE: Indexes for user_predictions ===
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date ON user_predictions(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_predictions_date_turno ON user_predictions(date, turno);

-- === PERFORMANCE: Indexes for prediction_history ===
CREATE INDEX IF NOT EXISTS idx_prediction_history_prediction_id ON prediction_history(prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_fecha ON prediction_history(user_id, fecha DESC);
