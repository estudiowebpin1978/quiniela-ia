-- =============================================================================
-- OMEGA V6 DATA PLATFORM — Core Schema + Auto-Evaluation + Backtesting
-- =============================================================================
-- Creates the data infrastructure for the closed-loop system:
--   SCRAPER → DRAWS → OMEGA → PREDICTIONS → EVALUATION → OPTIMIZATION
-- =============================================================================


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 1: ENGINE PREDICTIONS — Every prediction the engine generates
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS engine_predictions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_version  TEXT NOT NULL,
  turno           TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  generated_at    TIMESTAMPTZ DEFAULT NOW(),
  historical_cutoff DATE NOT NULL,
  draws_used      INT NOT NULL DEFAULT 0,

  pred_2c         INT[] NOT NULL,
  pred_3c         INT[],
  pred_4c         INT[],
  pred_redoblona  JSONB,

  scores_2c       JSONB NOT NULL DEFAULT '[]'::JSONB,
  weights_used    JSONB NOT NULL DEFAULT '{}'::JSONB,
  confidence      NUMERIC,

  UNIQUE (engine_version, turno, prediction_date)
);

CREATE INDEX IF NOT EXISTS idx_ep_engine ON engine_predictions(engine_version, turno);
CREATE INDEX IF NOT EXISTS idx_ep_date ON engine_predictions(prediction_date);
CREATE INDEX IF NOT EXISTS idx_ep_cutoff ON engine_predictions(historical_cutoff);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 2: PREDICTION RESULTS — Evaluation of each engine prediction
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS prediction_results (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  prediction_id   UUID NOT NULL REFERENCES engine_predictions(id) ON DELETE CASCADE,
  engine_version  TEXT NOT NULL,
  turno           TEXT NOT NULL,
  prediction_date DATE NOT NULL,

  actual_numbers  INT[] NOT NULL,

  hits_top1_2c    INT DEFAULT 0,
  hits_top3_2c    INT DEFAULT 0,
  hits_top5_2c    INT DEFAULT 0,
  hits_top10_2c   INT DEFAULT 0,

  hits_3c         INT DEFAULT 0,
  hits_4c         INT DEFAULT 0,
  redoblona_hit   BOOLEAN DEFAULT FALSE,

  avg_rank        NUMERIC,
  mrr             NUMERIC DEFAULT 0,

  factor_attribution JSONB DEFAULT '{}'::JSONB,

  evaluated_at    TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (prediction_id)
);

CREATE INDEX IF NOT EXISTS idx_pr_engine ON prediction_results(engine_version, turno);
CREATE INDEX IF NOT EXISTS idx_pr_date ON prediction_results(prediction_date);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 3: ENGINE METRICS — Aggregated performance per engine+turno+period
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS engine_metrics (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_version  TEXT NOT NULL,
  turno           TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,

  total_tests     INT DEFAULT 0,
  top10_hit_rate  NUMERIC DEFAULT 0,
  top5_hit_rate   NUMERIC DEFAULT 0,
  top3_hit_rate   NUMERIC DEFAULT 0,
  top1_hit_rate   NUMERIC DEFAULT 0,
  avg_hits        NUMERIC DEFAULT 0,
  mrr_avg         NUMERIC DEFAULT 0,

  hit_rate_3c     NUMERIC DEFAULT 0,
  hit_rate_4c     NUMERIC DEFAULT 0,
  hit_rate_redoblona NUMERIC DEFAULT 0,

  avg_confidence  NUMERIC DEFAULT 0,
  actual_hit_rate NUMERIC DEFAULT 0,
  lift_vs_random  NUMERIC DEFAULT 1.0,

  calculated_at   TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (engine_version, turno, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_em_engine ON engine_metrics(engine_version, turno);
CREATE INDEX IF NOT EXISTS idx_em_period ON engine_metrics(period_start, period_end);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 4: MODEL WEIGHTS — Configurable per-engine per-turno weights
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS model_weights (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  engine_version  TEXT NOT NULL,
  turno           TEXT NOT NULL DEFAULT 'ALL',

  w_frequency     NUMERIC DEFAULT 0.20,
  w_recency       NUMERIC DEFAULT 0.18,
  w_markov        NUMERIC DEFAULT 0.15,
  w_hotcold       NUMERIC DEFAULT 0.15,
  w_gap           NUMERIC DEFAULT 0.12,
  w_cooccurrence  NUMERIC DEFAULT 0.10,
  w_positional    NUMERIC DEFAULT 0.05,
  w_balance       NUMERIC DEFAULT 0.05,

  decay_lambda    NUMERIC DEFAULT 0.02,
  markov_window   INT DEFAULT 90,
  bayesian_prior  NUMERIC DEFAULT 100,

  optimized_from  TEXT DEFAULT 'manual',
  backtest_score  NUMERIC,
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (engine_version, turno)
);

INSERT INTO model_weights (engine_version, turno) VALUES
  ('omega_v5', 'ALL'),
  ('omega_v5', 'Previa'),
  ('omega_v5', 'Primera'),
  ('omega_v5', 'Matutina'),
  ('omega_v5', 'Vespertina'),
  ('omega_v5', 'Nocturna'),
  ('omega_v6_quantum', 'ALL'),
  ('omega_v6_quantum', 'Previa'),
  ('omega_v6_quantum', 'Primera'),
  ('omega_v6_quantum', 'Matutina'),
  ('omega_v6_quantum', 'Vespertina'),
  ('omega_v6_quantum', 'Nocturna')
ON CONFLICT (engine_version, turno) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 5: SCRAPE RUNS — Observability for scraping pipeline
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scrape_runs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,

  fecha           DATE NOT NULL,
  turnos_attempted TEXT[] DEFAULT '{}',
  turnos_succeeded TEXT[] DEFAULT '{}',

  sources_tried   TEXT[] DEFAULT '{}',
  winning_source  TEXT,
  consensus_method TEXT,

  total_duration_ms INT,
  per_turno_ms    JSONB DEFAULT '{}'::JSONB,

  errors          JSONB DEFAULT '[]'::JSONB,

  predictions_verified INT DEFAULT 0,
  predictions_generated INT DEFAULT 0,

  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_date ON scrape_runs(fecha);
CREATE INDEX IF NOT EXISTS idx_sr_started ON scrape_runs(started_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- TABLE 6: DRAW SOURCES — Multi-source tracking per draw
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS draw_sources (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  draw_id         UUID NOT NULL REFERENCES draws(id) ON DELETE CASCADE,
  source_name     TEXT NOT NULL,
  numbers         INT[] NOT NULL,
  html_hash       TEXT,
  response_ms     INT,
  status          TEXT DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED','CONFLICT','STALE','PARTIAL')),
  scraped_at      TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (draw_id, source_name)
);

CREATE INDEX IF NOT EXISTS idx_ds_draw ON draw_sources(draw_id);
CREATE INDEX IF NOT EXISTS idx_ds_source ON draw_sources(source_name, scraped_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
-- EXTEND: backtest_results with engine_version column
-- ═══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS
    engine_version TEXT DEFAULT 'Omega_v5';
  ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS
    weights_used JSONB;
  ALTER TABLE backtest_results ADD COLUMN IF NOT EXISTS
    confidence NUMERIC;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

UPDATE backtest_results SET engine_version = model_name WHERE engine_version IS NULL;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: AUTO-EVALUATE ENGINE PREDICTIONS
-- Fires when a draw is inserted. Evaluates all engine_predictions for that draw.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION evaluate_engine_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pred_rec       RECORD;
  nums_2         INT[];
  actual_2       INT[];
  hits_1         INT := 0;
  hits_3         INT := 0;
  hits_5         INT := 0;
  hits_10        INT := 0;
  reciprocal_sum NUMERIC := 0;
  rank_sum       NUMERIC := 0;
  matched_count  INT := 0;
  i              INT;
  factor_detail  JSONB;
BEGIN
  nums_2 := ARRAY(SELECT MOD(v, 100) FROM unnest(NEW.numbers) v ORDER BY 1);
  actual_2 := nums_2;

  FOR pred_rec IN
    SELECT id, engine_version, pred_2c, pred_3c, pred_4c, pred_redoblona, scores_2c
    FROM engine_predictions
    WHERE prediction_date = NEW.date AND turno = NEW.turno
  LOOP
    hits_1 := 0; hits_3 := 0; hits_5 := 0; hits_10 := 0;
    reciprocal_sum := 0; matched_count := 0;

    FOR i IN 1..LEAST(array_length(pred_rec.pred_2c, 1), 10) LOOP
      IF pred_rec.pred_2c[i] = ANY(actual_2) THEN
        matched_count := matched_count + 1;
        reciprocal_sum := reciprocal_sum + (1.0 / i);
        IF i = 1 THEN hits_1 := 1; END IF;
        IF i <= 3 THEN hits_3 := matched_count; END IF;
        IF i <= 5 THEN hits_5 := matched_count; END IF;
        hits_10 := matched_count;
      END IF;
    END LOOP;

    factor_detail := jsonb_build_object(
      'hits_detail', jsonb_build_object(
        'top1', hits_1, 'top3', hits_3, 'top5', hits_5, 'top10', hits_10
      ),
      'mrr', CASE WHEN reciprocal_sum > 0 THEN round(reciprocal_sum, 4) ELSE 0 END,
      'matched_positions', matched_count
    );

    INSERT INTO prediction_results (
      prediction_id, engine_version, turno, prediction_date,
      actual_numbers, hits_top1_2c, hits_top3_2c, hits_top5_2c, hits_top10_2c,
      mrr, factor_attribution
    ) VALUES (
      pred_rec.id, pred_rec.engine_version, NEW.turno, NEW.date,
      NEW.numbers, hits_1, hits_3, hits_5, hits_10,
      reciprocal_sum, factor_detail
    )
    ON CONFLICT (prediction_id) DO UPDATE SET
      actual_numbers = EXCLUDED.actual_numbers,
      hits_top1_2c = EXCLUDED.hits_top1_2c,
      hits_top3_2c = EXCLUDED.hits_top3_2c,
      hits_top5_2c = EXCLUDED.hits_top5_2c,
      hits_top10_2c = EXCLUDED.hits_top10_2c,
      mrr = EXCLUDED.mrr,
      factor_attribution = EXCLUDED.factor_attribution,
      evaluated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evaluate_engine_predictions ON draws;
CREATE TRIGGER trg_evaluate_engine_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION evaluate_engine_predictions();


-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: RECALCULATE ENGINE METRICS
-- Aggregates prediction_results into engine_metrics for a given period.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION recalculate_engine_metrics(
  p_engine_version TEXT,
  p_turno TEXT,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_start DATE;
  v_end   DATE;
  v_total INT;
  v_top10 INT;
  v_top5  INT;
  v_top3  INT;
  v_top1  INT;
  v_mrr   NUMERIC;
  v_avg   NUMERIC;
BEGIN
  SELECT COALESCE(p_start_date, MIN(prediction_date)),
         COALESCE(p_end_date, MAX(prediction_date))
  INTO v_start, v_end
  FROM prediction_results
  WHERE engine_version = p_engine_version AND turno = p_turno;

  IF v_start IS NULL OR v_end IS NULL THEN RETURN; END IF;

  SELECT count(*),
         sum(CASE WHEN hits_top10_2c > 0 THEN 1 ELSE 0 END),
         sum(CASE WHEN hits_top5_2c > 0 THEN 1 ELSE 0 END),
         sum(CASE WHEN hits_top3_2c > 0 THEN 1 ELSE 0 END),
         sum(CASE WHEN hits_top1_2c > 0 THEN 1 ELSE 0 END),
         avg(mrr),
         avg(hits_top10_2c)
  INTO v_total, v_top10, v_top5, v_top3, v_top1, v_mrr, v_avg
  FROM prediction_results
  WHERE engine_version = p_engine_version
    AND turno = p_turno
    AND prediction_date BETWEEN v_start AND v_end;

  IF v_total IS NULL OR v_total = 0 THEN RETURN; END IF;

  INSERT INTO engine_metrics (
    engine_version, turno, period_start, period_end,
    total_tests, top10_hit_rate, top5_hit_rate, top3_hit_rate, top1_hit_rate,
    avg_hits, mrr_avg, actual_hit_rate, lift_vs_random, calculated_at
  ) VALUES (
    p_engine_version, p_turno, v_start, v_end,
    v_total,
    round(v_top10::NUMERIC / v_total * 100, 2),
    round(v_top5::NUMERIC / v_total * 100, 2),
    round(v_top3::NUMERIC / v_total * 100, 2),
    round(v_top1::NUMERIC / v_total * 100, 2),
    round(v_avg, 4),
    round(COALESCE(v_mrr, 0), 4),
    round(v_top10::NUMERIC / v_total, 4),
    round((v_avg / 2.0), 4),
    NOW()
  )
  ON CONFLICT (engine_version, turno, period_start, period_end)
  DO UPDATE SET
    total_tests = EXCLUDED.total_tests,
    top10_hit_rate = EXCLUDED.top10_hit_rate,
    top5_hit_rate = EXCLUDED.top5_hit_rate,
    top3_hit_rate = EXCLUDED.top3_hit_rate,
    top1_hit_rate = EXCLUDED.top1_hit_rate,
    avg_hits = EXCLUDED.avg_hits,
    mrr_avg = EXCLUDED.mrr_avg,
    actual_hit_rate = EXCLUDED.actual_hit_rate,
    lift_vs_random = EXCLUDED.lift_vs_random,
    calculated_at = NOW();
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: SAVE ENGINE PREDICTION
-- Called from Next.js API to persist an engine prediction before the draw.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION save_engine_prediction(
  p_engine_version TEXT,
  p_turno TEXT,
  p_prediction_date DATE,
  p_historical_cutoff DATE,
  p_draws_used INT,
  p_pred_2c INT[],
  p_pred_3c INT[] DEFAULT NULL,
  p_pred_4c INT[] DEFAULT NULL,
  p_pred_redoblona JSONB DEFAULT NULL,
  p_scores_2c JSONB DEFAULT '[]'::JSONB,
  p_weights_used JSONB DEFAULT '{}'::JSONB,
  p_confidence NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO engine_predictions (
    engine_version, turno, prediction_date, historical_cutoff, draws_used,
    pred_2c, pred_3c, pred_4c, pred_redoblona,
    scores_2c, weights_used, confidence
  ) VALUES (
    p_engine_version, p_turno, p_prediction_date, p_historical_cutoff, p_draws_used,
    p_pred_2c, p_pred_3c, p_pred_4c, p_pred_redoblona,
    p_scores_2c, p_weights_used, p_confidence
  )
  ON CONFLICT (engine_version, turno, prediction_date) DO UPDATE SET
    pred_2c = EXCLUDED.pred_2c,
    pred_3c = EXCLUDED.pred_3c,
    pred_4c = EXCLUDED.pred_4c,
    pred_redoblona = EXCLUDED.pred_redoblona,
    scores_2c = EXCLUDED.scores_2c,
    weights_used = EXCLUDED.weights_used,
    confidence = EXCLUDED.confidence,
    generated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: WALK-FORWARD BACKTESTING
-- Tests any engine against historical data with proper no-leakage.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION backtest_walk_forward(
  p_engine_version TEXT,
  p_turno TEXT,
  p_start_date DATE DEFAULT '2025-06-01',
  p_end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  engine_version TEXT,
  turno TEXT,
  total_tests INT,
  top10_hit_rate NUMERIC,
  top5_hit_rate NUMERIC,
  top3_hit_rate NUMERIC,
  top1_hit_rate NUMERIC,
  avg_hits NUMERIC,
  mrr_avg NUMERIC,
  best_streak INT,
  worst_streak INT,
  pct_with_hits NUMERIC,
  lift_vs_random NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  test_date   DATE;
  actual_nums INT[];
  predicted   INT[];
  hits        INT;
  total_hits  INT := 0;
  total_tests INT := 0;
  with_hits   INT := 0;
  cur_streak  INT := 0;
  best_str    INT := 0;
  worst_str   INT := 0;
  mrr_sum     NUMERIC := 0;
  i           INT;
BEGIN
  FOR test_date IN
    SELECT d.date FROM draws d
    WHERE d.turno = p_turno AND d.date >= p_start_date AND d.date <= p_end_date
    ORDER BY d.date
  LOOP
    SELECT ARRAY(SELECT MOD(unnest(numbers), 100) ORDER BY 1)
    INTO actual_nums
    FROM draws WHERE turno = p_turno AND date = test_date;

    IF array_length(actual_nums, 1) IS DISTINCT FROM 20 THEN CONTINUE; END IF;

    SELECT ARRAY(
      SELECT numero FROM calculate_omega_v5(p_turno, 'free', test_date) LIMIT 10
    ) INTO predicted;

    IF predicted IS NULL OR array_length(predicted, 1) IS NULL THEN CONTINUE; END IF;

    hits := 0;
    FOR i IN 1..array_length(predicted, 1) LOOP
      IF predicted[i] = ANY(actual_nums) THEN
        hits := hits + 1;
        mrr_sum := mrr_sum + (1.0 / i);
      END IF;
    END LOOP;

    total_hits := total_hits + hits;
    total_tests := total_tests + 1;
    IF hits > 0 THEN
      with_hits := with_hits + 1;
      cur_streak := cur_streak + 1;
      IF cur_streak > best_str THEN best_str := cur_streak; END IF;
    ELSE
      IF cur_streak > worst_str THEN worst_str := cur_streak; END IF;
      cur_streak := 0;
    END IF;
  END LOOP;

  IF cur_streak > worst_str THEN worst_str := cur_streak; END IF;

  engine_version := p_engine_version;
  turno := p_turno;
  total_tests := total_tests;
  top10_hit_rate := CASE WHEN total_tests > 0 THEN round(total_hits::NUMERIC / (total_tests * 10) * 100, 2) ELSE 0 END;
  avg_hits := CASE WHEN total_tests > 0 THEN round(total_hits::NUMERIC / total_tests, 4) ELSE 0 END;
  mrr_avg := CASE WHEN total_tests > 0 THEN round(mrr_sum / total_tests, 4) ELSE 0 END;
  best_streak := best_str;
  worst_streak := worst_str;
  pct_with_hits := CASE WHEN total_tests > 0 THEN round(with_hits::NUMERIC / total_tests * 100, 2) ELSE 0 END;
  lift_vs_random := CASE WHEN total_tests > 0 THEN round((total_hits::NUMERIC / total_tests) / 2.0, 4) ELSE 1 END;
  top1_hit_rate := 0;
  top5_hit_rate := 0;
  top3_hit_rate := 0;
  RETURN NEXT;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- FUNCTION: COMPARE ALL ENGINES
-- Runs backtest for all registered engines on the same data.
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION compare_engines(
  p_turno TEXT,
  p_start_date DATE DEFAULT '2025-06-01',
  p_end_date DATE DEFAULT CURRENT_DATE - 1
)
RETURNS TABLE (
  engine_version TEXT,
  turno TEXT,
  total_tests INT,
  top10_hit_rate NUMERIC,
  avg_hits NUMERIC,
  mrr_avg NUMERIC,
  lift_vs_random NUMERIC,
  verdict TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_best_rate NUMERIC := 0;
  v_best_engine TEXT := '';
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT * FROM backtest_walk_forward('omega_v5', p_turno, p_start_date, p_end_date)
    UNION ALL
    SELECT * FROM backtest_walk_forward('omega_v6_quantum', p_turno, p_start_date, p_end_date)
  LOOP
    engine_version := rec.engine_version;
    turno := rec.turno;
    total_tests := rec.total_tests;
    top10_hit_rate := rec.top10_hit_rate;
    avg_hits := rec.avg_hits;
    mrr_avg := rec.mrr_avg;
    lift_vs_random := rec.lift_vs_random;

    IF rec.top10_hit_rate > v_best_rate THEN
      v_best_rate := rec.top10_hit_rate;
      v_best_engine := rec.engine_version;
    END IF;

    verdict := 'BASELINE';
    RETURN NEXT;
  END LOOP;

  -- Update verdicts
  UPDATE engine_metrics SET lift_vs_random = lift_vs_random
  WHERE engine_version = v_best_engine AND turno = p_turno;
END;
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS: Enable on new tables (service_role only for backend operations)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE engine_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE engine_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE scrape_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE draw_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS "service_role_engine_predictions" ON engine_predictions;
  CREATE POLICY "service_role_engine_predictions" ON engine_predictions FOR ALL USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "service_role_prediction_results" ON prediction_results;
  CREATE POLICY "service_role_prediction_results" ON prediction_results FOR ALL USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "public_read_engine_metrics" ON engine_metrics;
  CREATE POLICY "public_read_engine_metrics" ON engine_metrics FOR SELECT USING (true);
  DROP POLICY IF EXISTS "service_role_engine_metrics" ON engine_metrics;
  CREATE POLICY "service_role_engine_metrics" ON engine_metrics FOR ALL USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "public_read_model_weights" ON model_weights;
  CREATE POLICY "public_read_model_weights" ON model_weights FOR SELECT USING (true);
  DROP POLICY IF EXISTS "service_role_model_weights" ON model_weights;
  CREATE POLICY "service_role_model_weights" ON model_weights FOR ALL USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "service_role_scrape_runs" ON scrape_runs;
  CREATE POLICY "service_role_scrape_runs" ON scrape_runs FOR ALL USING (auth.role() = 'service_role');

  DROP POLICY IF EXISTS "service_role_draw_sources" ON draw_sources;
  CREATE POLICY "service_role_draw_sources" ON draw_sources FOR ALL USING (auth.role() = 'service_role');
END $$;


-- =============================================================================
-- DONE — Omega V6 Data Platform schema ready
-- =============================================================================
