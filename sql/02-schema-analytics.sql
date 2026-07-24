-- ============================================================================
-- 02-schema-analytics.sql: Analytics tables (turn_analytics, backtest_results)
-- Ejecutar DESPUÉS de 01-schema-core.sql
-- ============================================================================

-- ============================================================================
-- ANALÍTICAS PRE-CALCULADAS (Materialized View lógica vía RPC + upsert diario)
-- ============================================================================
CREATE TABLE IF NOT EXISTS turn_analytics (
    id                  BIGSERIAL PRIMARY KEY,
    game_id             UUID NOT NULL REFERENCES games(id),
    turno               TEXT NOT NULL,
    fecha               DATE NOT NULL,
    fecha_calculo       TIMESTAMPTZ DEFAULT NOW(),
    
    -- Shannon Entropy
    entropy_value       NUMERIC(6,4),
    entropy_trend       TEXT CHECK (entropy_trend IN ('ascending','descending','stable')),
    entropy_alert       BOOLEAN,
    entropy_distribution JSONB,
    
    -- Survival Analysis
    survival_hazard     JSONB,
    survival_critical   JSONB,
    overall_hazard      NUMERIC(6,4),
    
    -- Inter-Turno Markov
    markov_transitions  JSONB,
    markov_order        INT DEFAULT 2,
    markov_patterns     JSONB,
    
    -- Genetic Algorithm Weights
    genetic_weights     JSONB,
    genetic_fitness     NUMERIC(6,4),
    
    -- Composite Confidence Score (0-1)
    composite_confidence NUMERIC(4,3),
    
    UNIQUE (game_id, turno, fecha)
);

CREATE INDEX IF NOT EXISTS idx_turn_analytics_game_turno_fecha 
    ON turn_analytics (game_id, turno, fecha DESC);

-- ============================================================================
-- BACKTESTING HISTÓRICO (Para auditoría de modelos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS backtest_results (
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
    roi_2c                  NUMERIC(8,2),
    
    UNIQUE (game_id, turno, model_type, test_date, train_window_start)
);

CREATE INDEX IF NOT EXISTS idx_backtest_game_turno_model_date 
    ON backtest_results (game_id, turno, model_type, test_date DESC);

-- ============================================================================
-- ML MODELS (Caché de modelos entrenados)
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_models (
    id              BIGSERIAL PRIMARY KEY,
    game_id         UUID NOT NULL REFERENCES games(id),
    turno           TEXT NOT NULL,
    modelos         JSONB NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (game_id, turno)
);

CREATE INDEX IF NOT EXISTS idx_ml_models_game_turno 
    ON ml_models (game_id, turno);

-- ============================================================================
-- DEEP LEARNING MODELS
-- ============================================================================
CREATE TABLE IF NOT EXISTS ml_dl_models (
    id              BIGSERIAL PRIMARY KEY,
    game_id         UUID NOT NULL REFERENCES games(id),
    turno           TEXT NOT NULL,
    modelos         JSONB NOT NULL,
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (game_id, turno)
);

CREATE INDEX IF NOT EXISTS idx_ml_dl_models_game_turno 
    ON ml_dl_models (game_id, turno);

-- ============================================================================
-- MOTOR PERFORMANCE (Tracking de precisión por motor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS motor_performance (
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

CREATE INDEX IF NOT EXISTS idx_motor_performance_game_turno 
    ON motor_performance (game_id, turno);