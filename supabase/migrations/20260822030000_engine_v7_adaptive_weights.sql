-- =============================================================
-- V7 Engine: Adaptive weights storage
-- Stores per-turno V7 factor weights that auto-adjust after each draw.
-- =============================================================

CREATE TABLE IF NOT EXISTS engine_v7_weights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno TEXT NOT NULL,
  -- 10 V7 factor weights
  w_survival REAL NOT NULL DEFAULT 0.18,
  w_correlation REAL NOT NULL DEFAULT 0.12,
  w_spacing REAL NOT NULL DEFAULT 0.14,
  w_frequency REAL NOT NULL DEFAULT 0.15,
  w_recency REAL NOT NULL DEFAULT 0.10,
  w_markov REAL NOT NULL DEFAULT 0.08,
  w_cycles REAL NOT NULL DEFAULT 0.06,
  w_temporal REAL NOT NULL DEFAULT 0.07,
  w_debt REAL NOT NULL DEFAULT 0.10,
  w_bayesian REAL NOT NULL DEFAULT 0.00,
  -- Blend ratio (V6 weight, V7 weight = 1 - v6_weight)
  v6_weight REAL NOT NULL DEFAULT 0.60,
  -- Metadata
  hit_rate REAL DEFAULT 0,
  total_evaluations INT DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno)
);

-- Seed with defaults for each turno
INSERT INTO engine_v7_weights (turno) VALUES ('Previa'), ('Primera'), ('Matutina'), ('Vespertina'), ('Nocturna')
ON CONFLICT (turno) DO NOTHING;

-- RPC: Update V7 weights after evaluation
CREATE OR REPLACE FUNCTION update_v7_weights(
  p_turno TEXT,
  p_w_survival REAL,
  p_w_correlation REAL,
  p_w_spacing REAL,
  p_w_frequency REAL,
  p_w_recency REAL,
  p_w_markov REAL,
  p_w_cycles REAL,
  p_w_temporal REAL,
  p_w_debt REAL,
  p_w_bayesian REAL,
  p_v6_weight REAL,
  p_hit_rate REAL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE engine_v7_weights SET
    w_survival = p_w_survival,
    w_correlation = p_w_correlation,
    w_spacing = p_w_spacing,
    w_frequency = p_w_frequency,
    w_recency = p_w_recency,
    w_markov = p_w_markov,
    w_cycles = p_w_cycles,
    w_temporal = p_w_temporal,
    w_debt = p_w_debt,
    w_bayesian = p_w_bayesian,
    v6_weight = p_v6_weight,
    hit_rate = p_hit_rate,
    total_evaluations = total_evaluations + 1,
    last_evaluated_at = now(),
    updated_at = now()
  WHERE turno = p_turno;

  IF NOT FOUND THEN
    INSERT INTO engine_v7_weights (
      turno, w_survival, w_correlation, w_spacing, w_frequency,
      w_recency, w_markov, w_cycles, w_temporal, w_debt, w_bayesian,
      v6_weight, hit_rate, total_evaluations, last_evaluated_at
    ) VALUES (
      p_turno, p_w_survival, p_w_correlation, p_w_spacing, p_w_frequency,
      p_w_recency, p_w_markov, p_w_cycles, p_w_temporal, p_w_debt, p_w_bayesian,
      p_v6_weight, p_hit_rate, 1, now()
    );
  END IF;
END;
$$;

-- RPC: Get current V7 weights for a turno
CREATE OR REPLACE FUNCTION get_v7_weights(p_turno TEXT)
RETURNS TABLE (
  w_survival REAL,
  w_correlation REAL,
  w_spacing REAL,
  w_frequency REAL,
  w_recency REAL,
  w_markov REAL,
  w_cycles REAL,
  w_temporal REAL,
  w_debt REAL,
  w_bayesian REAL,
  v6_weight REAL,
  hit_rate REAL,
  total_evaluations INT
)
LANGUAGE sql
STABLE
AS $$
  SELECT w_survival, w_correlation, w_spacing, w_frequency,
         w_recency, w_markov, w_cycles, w_temporal, w_debt, w_bayesian,
         v6_weight, hit_rate, total_evaluations
  FROM engine_v7_weights
  WHERE turno = p_turno;
$$;
