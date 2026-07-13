-- prediction_history: log de predicciones verificadas contra resultados oficiales
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

CREATE INDEX IF NOT EXISTS idx_prediction_history_prediction_id
  ON prediction_history (prediction_id);
CREATE INDEX IF NOT EXISTS idx_prediction_history_fecha_turno
  ON prediction_history (fecha, turno);
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_id
  ON prediction_history (user_id);

-- user_stats: estadísticas acumuladas por usuario
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id),
  total_predictions INT DEFAULT 0,
  total_hits INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_verified TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: service role only for prediction_history and user_stats
ALTER TABLE prediction_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "Service role only prediction_history" ON prediction_history;
  DROP POLICY IF EXISTS "Service role only user_stats" ON user_stats;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE POLICY "Service role only prediction_history" ON prediction_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role only user_stats" ON user_stats FOR ALL USING (auth.role() = 'service_role');
