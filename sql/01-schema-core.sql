-- ============================================================================
-- 01-schema-core.sql: Core tables (games, draws, user_profiles, predictions)
-- Ejecutar PRIMERO en Supabase SQL Editor
-- ============================================================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CATÁLOGO DE JUEGOS (Abstracción para Quini 6, Loto, etc.)
-- ============================================================================
CREATE TABLE IF NOT EXISTS games (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug            TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    description     TEXT,
    number_count    INT NOT NULL,
    number_range_min INT DEFAULT 0,
    number_range_max INT DEFAULT 9999,
    draws_per_day   INT DEFAULT 1,
    turns           JSONB DEFAULT '["Nocturna"]'::JSONB,
    is_active       BOOLEAN DEFAULT TRUE,
    config          JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add columns if table already exists (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'description') THEN
    ALTER TABLE games ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'number_range_min') THEN
    ALTER TABLE games ADD COLUMN number_range_min INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'number_range_max') THEN
    ALTER TABLE games ADD COLUMN number_range_max INT DEFAULT 9999;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'config') THEN
    ALTER TABLE games ADD COLUMN config JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'games' AND column_name = 'turns') THEN
    ALTER TABLE games ADD COLUMN turns JSONB DEFAULT '["Nocturna"]'::JSONB;
  END IF;
END $$;

-- Datos semilla
INSERT INTO games (slug, name, number_count, number_range_min, number_range_max, turns) VALUES
('quiniela', 'Quiniela Nacional', 20, 0, 9999,
  '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::JSONB),
('quini6', 'Quini 6', 6, 0, 45,
  '["Tradicional","Segunda","Revancha","Siempre Sale"]'::JSONB)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SORTEOS OFICIALES (Fuente de verdad inmutable)
-- ============================================================================
CREATE TABLE IF NOT EXISTS draws (
    id              BIGSERIAL PRIMARY KEY,
    game_id         UUID NOT NULL REFERENCES games(id),
    date            DATE NOT NULL,
    turno           TEXT NOT NULL,
    numbers         INT[] NOT NULL,
    source          TEXT NOT NULL,
    html_hash       TEXT,
    confidence_score NUMERIC(3,2),
    source_priority INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (game_id, date, turno)
);

CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date_desc 
    ON draws (game_id, turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_game_date_turno 
    ON draws (game_id, date, turno);

-- ============================================================================
-- PERFIL DE USUARIO + TIER
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free','premium','admin')),
    premium_until   TIMESTAMPTZ,
    trial_ends_at   TIMESTAMPTZ,
    predictions_used INT DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para trial_ends_at automático
CREATE OR REPLACE FUNCTION set_trial_ends_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    IF NEW.trial_ends_at IS NULL AND NEW.role = 'free' THEN
        NEW.trial_ends_at := NOW() + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_trial_ends_at ON user_profiles;
CREATE TRIGGER trigger_set_trial_ends_at
    BEFORE INSERT ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_trial_ends_at();

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_set_updated_at ON user_profiles;
CREATE TRIGGER trigger_set_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================================
-- PREDICCIONES DE USUARIO
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id         UUID NOT NULL REFERENCES games(id),
    date            DATE NOT NULL,
    turno           TEXT NOT NULL,
    numbers_2c      INT[] NOT NULL,
    numbers_3c      INT[] DEFAULT '{}',
    numbers_4c      INT[] DEFAULT '{}',
    redoblona       TEXT,
    confidence      INT CHECK (confidence >= 0 AND confidence <= 100),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date 
    ON user_predictions (user_id, date DESC);

-- ============================================================================
-- VERIFICACIÓN DE ACIERTOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS prediction_history (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id       UUID NOT NULL REFERENCES user_predictions(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    game_id             UUID NOT NULL REFERENCES games(id),
    date                DATE NOT NULL,
    turno               TEXT NOT NULL,
    predicted_2c        INT[],
    predicted_3c        INT[],
    predicted_4c        INT[],
    actual_2c           INT,
    actual_3c           INT,
    actual_4c           INT,
    hit_2c              BOOLEAN,
    hit_3c              BOOLEAN,
    hit_4c              BOOLEAN,
    verified_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date 
    ON prediction_history (user_id, date DESC);