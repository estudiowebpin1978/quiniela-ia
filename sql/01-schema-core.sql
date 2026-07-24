-- ============================================================================
-- 01-schema-core.sql: Core tables (fully idempotent)
-- Handles existing schemas where draws may have 'date' or 'fecha'
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. GAMES TABLE
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'games' AND table_schema = 'public') THEN
    CREATE TABLE games (
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
  END IF;
END $$;

-- Add missing columns to games (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='description') THEN
    ALTER TABLE games ADD COLUMN description TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='number_range_min') THEN
    ALTER TABLE games ADD COLUMN number_range_min INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='number_range_max') THEN
    ALTER TABLE games ADD COLUMN number_range_max INT DEFAULT 9999;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='config') THEN
    ALTER TABLE games ADD COLUMN config JSONB DEFAULT '{}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='games' AND column_name='turns') THEN
    ALTER TABLE games ADD COLUMN turns JSONB DEFAULT '["Nocturna"]'::JSONB;
  END IF;
END $$;

INSERT INTO games (slug, name, number_count, number_range_min, number_range_max, turns) VALUES
('quiniela', 'Quiniela Nacional', 20, 0, 9999,
  '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::JSONB)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  turns = EXCLUDED.turns;

-- ============================================================================
-- 2. DRAWS TABLE (normalize: ensure column is named 'date')
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'draws' AND table_schema = 'public') THEN
    CREATE TABLE draws (
      id              BIGSERIAL PRIMARY KEY,
      game_id         UUID NOT NULL REFERENCES games(id),
      date            DATE NOT NULL,
      turno           TEXT NOT NULL,
      numbers         INT[] NOT NULL,
      source          TEXT NOT NULL,
      html_hash       TEXT,
      confidence_score NUMERIC(3,2),
      source_priority INT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- Normalize: if table has 'fecha' but not 'date', rename it
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='date') THEN
    ALTER TABLE draws RENAME COLUMN fecha TO date;
  END IF;
END $$;

-- Add missing columns to draws
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='source') THEN
    ALTER TABLE draws ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='html_hash') THEN
    ALTER TABLE draws ADD COLUMN html_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='confidence_score') THEN
    ALTER TABLE draws ADD COLUMN confidence_score NUMERIC(3,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='source_priority') THEN
    ALTER TABLE draws ADD COLUMN source_priority INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='game_id') THEN
    ALTER TABLE draws ADD COLUMN game_id UUID REFERENCES games(id);
  END IF;
END $$;

-- Drop old unique constraints and create correct one
DO $$ BEGIN
  BEGIN ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_date_turno_key; EXCEPTION WHEN undefined_object THEN NULL; END;
  BEGIN ALTER TABLE draws DROP CONSTRAINT IF EXISTS draws_unique_date_turno_game; EXCEPTION WHEN undefined_object THEN NULL; END;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'draws_unique_date_turno_game' AND conrelid = 'draws'::regclass
  ) THEN
    ALTER TABLE draws ADD CONSTRAINT draws_unique_date_turno_game UNIQUE (game_id, date, turno);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date_desc ON draws (game_id, turno, date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_game_date_turno ON draws (game_id, date, turno);
CREATE INDEX IF NOT EXISTS idx_draws_turno_date ON draws (turno, date DESC);

-- ============================================================================
-- 3. USER_PROFILES TABLE
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_profiles' AND table_schema = 'public') THEN
    CREATE TABLE user_profiles (
      id              UUID PRIMARY KEY,
      email           TEXT NOT NULL,
      role            TEXT NOT NULL DEFAULT 'free' CHECK (role IN ('free','premium','admin')),
      premium_until   TIMESTAMPTZ,
      trial_ends_at   TIMESTAMPTZ,
      predictions_used INT DEFAULT 0,
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='trial_ends_at') THEN
    ALTER TABLE user_profiles ADD COLUMN trial_ends_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='predictions_used') THEN
    ALTER TABLE user_profiles ADD COLUMN predictions_used INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='updated_at') THEN
    ALTER TABLE user_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- ============================================================================
-- 4. USER_PREDICTIONS TABLE
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_predictions' AND table_schema = 'public') THEN
    CREATE TABLE user_predictions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID NOT NULL,
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
  END IF;
END $$;

-- Normalize fecha -> date if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_predictions' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_predictions' AND column_name='date') THEN
    ALTER TABLE user_predictions RENAME COLUMN fecha TO date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_predictions_user_date ON user_predictions (user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_predictions_user_turno ON user_predictions (user_id, turno, date DESC);

-- ============================================================================
-- 5. PREDICTION_HISTORY TABLE
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prediction_history' AND table_schema = 'public') THEN
    CREATE TABLE prediction_history (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prediction_id       UUID NOT NULL,
      user_id             UUID NOT NULL,
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
  END IF;
END $$;

-- Normalize fecha -> date if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prediction_history' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prediction_history' AND column_name='date') THEN
    ALTER TABLE prediction_history RENAME COLUMN fecha TO date;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_prediction_history_user_date ON prediction_history (user_id, date DESC);

-- ============================================================================
-- 6. USER_STATS TABLE (for admin dashboard)
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_stats' AND table_schema = 'public') THEN
    CREATE TABLE user_stats (
      user_id         UUID PRIMARY KEY,
      total_predictions INT DEFAULT 0,
      hits_2c         INT DEFAULT 0,
      hits_3c         INT DEFAULT 0,
      hits_4c         INT DEFAULT 0,
      accuracy_2c     NUMERIC(6,4) DEFAULT 0,
      last_prediction TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
END $$;

-- ============================================================================
-- 7. SEED GAMES DATA
-- ============================================================================
INSERT INTO games (slug, name, number_count, number_range_min, number_range_max, turns) VALUES
('quiniela', 'Quiniela Nacional', 20, 0, 9999,
  '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::JSONB)
ON CONFLICT (slug) DO NOTHING;
