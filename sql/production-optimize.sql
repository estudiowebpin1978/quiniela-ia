-- Quiniela IA — optimización producción (ejecutar en Supabase SQL Editor)
-- Alineado con lib/verificacion/auto-verify.ts y lib/auth/tier.ts

-- 1) Draws sin duplicados
CREATE UNIQUE INDEX IF NOT EXISTS draws_date_turno_uidx ON draws (date, turno);

-- 2) Perfiles / trial
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;

-- 3) Historial de verificación (schema canónico)
CREATE TABLE IF NOT EXISTS prediction_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_id UUID,
  user_id UUID,
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

CREATE UNIQUE INDEX IF NOT EXISTS prediction_history_prediction_id_uidx
  ON prediction_history (prediction_id)
  WHERE prediction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_history_fecha_turno
  ON prediction_history (fecha, turno);
CREATE INDEX IF NOT EXISTS idx_prediction_history_user_id
  ON prediction_history (user_id);

-- 4) Stats de usuario
CREATE TABLE IF NOT EXISTS user_stats (
  user_id UUID PRIMARY KEY,
  total_predictions INT DEFAULT 0,
  total_hits INT DEFAULT 0,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  last_verified TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5) RPC: frecuencias / atrasos 2 cifras (trabajo pesado en Postgres)
CREATE OR REPLACE FUNCTION public.stats_2cifras(
  p_turno TEXT,
  p_limit INT DEFAULT 150
)
RETURNS TABLE (
  terminacion INT,
  frecuencia BIGINT,
  ultima_fecha DATE,
  atraso INT
)
LANGUAGE sql
STABLE
AS $$
  WITH recent AS (
    SELECT date, numbers
    FROM draws
    WHERE lower(turno) LIKE '%' || lower(p_turno) || '%'
    ORDER BY date DESC
    LIMIT GREATEST(p_limit, 1)
  ),
  expanded AS (
    SELECT d.date, (n % 100)::INT AS terminacion
    FROM recent d
    CROSS JOIN LATERAL unnest(d.numbers) AS n
  ),
  agg AS (
    SELECT terminacion, COUNT(*)::BIGINT AS frecuencia, MAX(date) AS ultima_fecha
    FROM expanded
    GROUP BY terminacion
  ),
  maxd AS (SELECT MAX(date) AS max_date FROM recent)
  SELECT
    a.terminacion,
    a.frecuencia,
    a.ultima_fecha,
    GREATEST(0, (SELECT max_date FROM maxd)::date - a.ultima_fecha)::INT AS atraso
  FROM agg a
  ORDER BY a.frecuencia DESC;
$$;

GRANT EXECUTE ON FUNCTION public.stats_2cifras(TEXT, INT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.count_user_predictions(p_user UUID)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::INT FROM user_predictions WHERE user_id = p_user;
$$;

GRANT EXECUTE ON FUNCTION public.count_user_predictions(UUID) TO anon, authenticated, service_role;

-- 6) Scores ML opcionales (JSON, sin runtime Python)
CREATE TABLE IF NOT EXISTS ml_model_scores (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL,
  model_type TEXT DEFAULT 'ensemble',
  scores JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (turno, model_type)
);
