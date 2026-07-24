-- ============================================================================
-- 02-schema-analytics.sql: Analytics tables (fully idempotent)
-- ============================================================================

-- ============================================================================
-- 1. TURN_ANALYTICS (uses 'fecha' not 'date')
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'turn_analytics' AND table_schema = 'public') THEN
    CREATE TABLE turn_analytics (
      id                  BIGSERIAL PRIMARY KEY,
      game_id             UUID NOT NULL REFERENCES games(id),
      turno               TEXT NOT NULL,
      fecha               DATE NOT NULL,
      fecha_calculo       TIMESTAMPTZ DEFAULT NOW(),
      entropy_value       NUMERIC(6,4),
      entropy_trend       TEXT CHECK (entropy_trend IN ('ascending','descending','stable')),
      entropy_alert       BOOLEAN,
      entropy_distribution JSONB,
      survival_hazard     JSONB,
      survival_critical   JSONB,
      overall_hazard      NUMERIC(6,4),
      markov_transitions  JSONB,
      markov_order        INT DEFAULT 2,
      markov_patterns     JSONB,
      genetic_weights     JSONB,
      genetic_fitness     NUMERIC(6,4),
      composite_confidence NUMERIC(4,3),
      UNIQUE (game_id, turno, fecha)
    );
  END IF;
END $$;

-- Normalize date -> fecha if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='turn_analytics' AND column_name='date')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='turn_analytics' AND column_name='fecha') THEN
    ALTER TABLE turn_analytics RENAME COLUMN date TO fecha;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='turn_analytics' AND column_name='composite_confidence') THEN
    ALTER TABLE turn_analytics ADD COLUMN composite_confidence NUMERIC(4,3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_turn_analytics_game_turno_fecha ON turn_analytics (game_id, turno, fecha DESC);
CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha ON turn_analytics (turno, fecha DESC);

-- ============================================================================
-- 2. BACKTEST_RESULTS (uses 'test_date')
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'backtest_results' AND table_schema = 'public') THEN
    CREATE TABLE backtest_results (
      id                      BIGSERIAL PRIMARY KEY,
      game_id                 UUID NOT NULL REFERENCES games(id),
      turno                   TEXT NOT NULL,
      model_type              TEXT NOT NULL,
      test_date               DATE NOT NULL,
      train_window_start      DATE NOT NULL,
      train_window_end        DATE NOT NULL,
      hit_at_1_2c             BOOLEAN,
      hit_at_5_2c             BOOLEAN,
      hit_at_10_2c            BOOLEAN,
      rank_2c                 INT,
      score_2c                NUMERIC(6,4),
      roi_2c                  NUMERIC(8,2)
    );
  END IF;
END $$;

-- Add game_id if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='backtest_results' AND column_name='game_id') THEN
    ALTER TABLE backtest_results ADD COLUMN game_id UUID REFERENCES games(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_backtest_game_turno_model_date ON backtest_results (game_id, turno, model_type, test_date DESC);

-- ============================================================================
-- 3. ML_MODELS
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ml_models' AND table_schema = 'public') THEN
    CREATE TABLE ml_models (
      id              BIGSERIAL PRIMARY KEY,
      game_id         UUID NOT NULL REFERENCES games(id),
      turno           TEXT NOT NULL,
      modelos         JSONB NOT NULL DEFAULT '{}'::JSONB,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (game_id, turno)
    );
  END IF;
END $$;

-- ============================================================================
-- 4. ML_DL_MODELS
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ml_dl_models' AND table_schema = 'public') THEN
    CREATE TABLE ml_dl_models (
      id              BIGSERIAL PRIMARY KEY,
      game_id         UUID NOT NULL REFERENCES games(id),
      turno           TEXT NOT NULL,
      modelos         JSONB NOT NULL DEFAULT '{}'::JSONB,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (game_id, turno)
    );
  END IF;
END $$;

-- ============================================================================
-- 5. MOTOR_PERFORMANCE
-- ============================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'motor_performance' AND table_schema = 'public') THEN
    CREATE TABLE motor_performance (
      id              BIGSERIAL PRIMARY KEY,
      game_id         UUID NOT NULL REFERENCES games(id),
      motor           TEXT NOT NULL,
      turno           TEXT NOT NULL,
      accuracy        NUMERIC(6,4) DEFAULT 0,
      times_used      INT DEFAULT 0,
      last_used       TIMESTAMPTZ,
      updated_at      TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (game_id, motor, turno)
    );
  END IF;
END $$;
