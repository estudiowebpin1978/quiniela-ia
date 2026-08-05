-- ============================================================
-- MIGRATION: Engine Omega v3 — Dynamic Factor Weight Feedback
-- Date: 2026-08-05
-- Description: Adds dynamic weight adjustment for the 12-factor
--   ensemble. After each draw, a feedback loop evaluates which
--   factors were most accurate and adjusts weights accordingly.
-- ============================================================

-- ── Drop functions that will be recreated ────────────────────
DROP FUNCTION IF EXISTS refresh_cached_predictions(text);
DROP FUNCTION IF EXISTS calcular_prediccion_enhanced(text);
DROP FUNCTION IF EXISTS get_factor_weights(text);
DROP FUNCTION IF EXISTS update_factor_weights(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric, jsonb, integer);

-- ── 1. engine_factor_weights: current weights per turno ──────
CREATE TABLE IF NOT EXISTS engine_factor_weights (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL UNIQUE,
  w_calor NUMERIC(5,2) DEFAULT 12,
  w_demora NUMERIC(5,2) DEFAULT 14,
  w_afinidad NUMERIC(5,2) DEFAULT 8,
  w_markov NUMERIC(5,2) DEFAULT 10,
  w_bayesian NUMERIC(5,2) DEFAULT 10,
  w_entropy NUMERIC(5,2) DEFAULT 8,
  w_survival NUMERIC(5,2) DEFAULT 10,
  w_cyclic NUMERIC(5,2) DEFAULT 6,
  w_drift NUMERIC(5,2) DEFAULT 8,
  w_correlation NUMERIC(5,2) DEFAULT 6,
  w_seasonal NUMERIC(5,2) DEFAULT 4,
  w_montecarlo NUMERIC(5,2) DEFAULT 4,
  accuracy_7d NUMERIC(5,2) DEFAULT 0,
  total_evaluations INT DEFAULT 0,
  last_evaluated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default weights for all 5 turnos
INSERT INTO engine_factor_weights (turno) VALUES
  ('Previa'), ('Primera'), ('Matutina'), ('Vespertina'), ('Nocturna')
ON CONFLICT (turno) DO NOTHING;

-- RLS: service_role full access, public read
ALTER TABLE engine_factor_weights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_engine_factor_weights" ON engine_factor_weights FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_engine_factor_weights" ON engine_factor_weights FOR SELECT USING (true);

-- ── 2. factor_weight_history: audit trail ───────────────────
CREATE TABLE IF NOT EXISTS factor_weight_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  evaluation_date DATE NOT NULL,
  w_calor NUMERIC(5,2), w_demora NUMERIC(5,2), w_afinidad NUMERIC(5,2),
  w_markov NUMERIC(5,2), w_bayesian NUMERIC(5,2), w_entropy NUMERIC(5,2),
  w_survival NUMERIC(5,2), w_cyclic NUMERIC(5,2), w_drift NUMERIC(5,2),
  w_correlation NUMERIC(5,2), w_seasonal NUMERIC(5,2), w_montecarlo NUMERIC(5,2),
  hit_rate NUMERIC(5,2),
  factor_accuracies JSONB,  -- {calor: 0.8, demora: 0.6, ...}
  draws_evaluated INT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fwh_turno_date ON factor_weight_history (turno, evaluation_date DESC);

ALTER TABLE factor_weight_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_factor_weight_history" ON factor_weight_history FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_factor_weight_history" ON factor_weight_history FOR SELECT USING (true);

-- ── 3. RPC: get_factor_weights ──────────────────────────────
CREATE OR REPLACE FUNCTION get_factor_weights(p_turno TEXT)
RETURNS TABLE (
  w_calor NUMERIC, w_demora NUMERIC, w_afinidad NUMERIC,
  w_markov NUMERIC, w_bayesian NUMERIC, w_entropy NUMERIC,
  w_survival NUMERIC, w_cyclic NUMERIC, w_drift NUMERIC,
  w_correlation NUMERIC, w_seasonal NUMERIC, w_montecarlo NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    efw.w_calor, efw.w_demora, efw.w_afinidad,
    efw.w_markov, efw.w_bayesian, efw.w_entropy,
    efw.w_survival, efw.w_cyclic, efw.w_drift,
    efw.w_correlation, efw.w_seasonal, efw.w_montecarlo
  FROM engine_factor_weights efw
  WHERE efw.turno = p_turno;

  -- If no row found, return defaults
  IF NOT FOUND THEN
    RETURN QUERY SELECT
      12::NUMERIC, 14::NUMERIC, 8::NUMERIC,
      10::NUMERIC, 10::NUMERIC, 8::NUMERIC,
      10::NUMERIC, 6::NUMERIC, 8::NUMERIC,
      6::NUMERIC, 4::NUMERIC, 4::NUMERIC;
  END IF;
END;
$$;

-- ── 4. RPC: update_factor_weights ───────────────────────────
CREATE OR REPLACE FUNCTION update_factor_weights(
  p_turno TEXT,
  p_w_calor NUMERIC, p_w_demora NUMERIC, p_w_afinidad NUMERIC,
  p_w_markov NUMERIC, p_w_bayesian NUMERIC, p_w_entropy NUMERIC,
  p_w_survival NUMERIC, p_w_cyclic NUMERIC, p_w_drift NUMERIC,
  p_w_correlation NUMERIC, p_w_seasonal NUMERIC, p_w_montecarlo NUMERIC,
  p_hit_rate NUMERIC DEFAULT 0,
  p_factor_accuracies JSONB DEFAULT '{}'::JSONB,
  p_draws_evaluated INT DEFAULT 1
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  -- Upsert current weights
  INSERT INTO engine_factor_weights (
    turno, w_calor, w_demora, w_afinidad, w_markov, w_bayesian, w_entropy,
    w_survival, w_cyclic, w_drift, w_correlation, w_seasonal, w_montecarlo,
    accuracy_7d, total_evaluations, last_evaluated_at, updated_at
  ) VALUES (
    p_turno, p_w_calor, p_w_demora, p_w_afinidad, p_w_markov, p_w_bayesian, p_w_entropy,
    p_w_survival, p_w_cyclic, p_w_drift, p_w_correlation, p_w_seasonal, p_w_montecarlo,
    p_hit_rate, p_draws_evaluated, now(), now()
  )
  ON CONFLICT (turno) DO UPDATE SET
    w_calor = EXCLUDED.w_calor, w_demora = EXCLUDED.w_demora,
    w_afinidad = EXCLUDED.w_afinidad, w_markov = EXCLUDED.w_markov,
    w_bayesian = EXCLUDED.w_bayesian, w_entropy = EXCLUDED.w_entropy,
    w_survival = EXCLUDED.w_survival, w_cyclic = EXCLUDED.w_cyclic,
    w_drift = EXCLUDED.w_drift, w_correlation = EXCLUDED.w_correlation,
    w_seasonal = EXCLUDED.w_seasonal, w_montecarlo = EXCLUDED.w_montecarlo,
    accuracy_7d = EXCLUDED.accuracy_7d,
    total_evaluations = engine_factor_weights.total_evaluations + EXCLUDED.total_evaluations,
    last_evaluated_at = now(), updated_at = now();

  -- Insert history record
  INSERT INTO factor_weight_history (
    turno, evaluation_date, w_calor, w_demora, w_afinidad, w_markov,
    w_bayesian, w_entropy, w_survival, w_cyclic, w_drift,
    w_correlation, w_seasonal, w_montecarlo,
    hit_rate, factor_accuracies, draws_evaluated
  ) VALUES (
    p_turno, CURRENT_DATE, p_w_calor, p_w_demora, p_w_afinidad, p_w_markov,
    p_w_bayesian, p_w_entropy, p_w_survival, p_w_cyclic, p_w_drift,
    p_w_correlation, p_w_seasonal, p_w_montecarlo,
    p_hit_rate, p_factor_accuracies, p_draws_evaluated
  );
END;
$$;

-- ── 5. Modify calcular_prediccion_enhanced to use DB weights ─
CREATE OR REPLACE FUNCTION calcular_prediccion_enhanced(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  f_calor NUMERIC, f_demora NUMERIC, f_afinidad NUMERIC, f_markov NUMERIC,
  f_bayesian NUMERIC, f_entropy NUMERIC, f_survival NUMERIC, f_cyclic NUMERIC,
  f_drift NUMERIC, f_correlation NUMERIC, f_seasonal NUMERIC, f_montecarlo NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_sorteos INT;
  ultimo_numero_cabeza INT;
  -- Dynamic weights from DB (defaults if no row)
  w_calor NUMERIC := 12; w_demora NUMERIC := 14; w_afinidad NUMERIC := 8;
  w_markov NUMERIC := 10; w_bayesian NUMERIC := 10; w_entropy NUMERIC := 8;
  w_survival NUMERIC := 10; w_cyclic NUMERIC := 6; w_drift NUMERIC := 8;
  w_correlation NUMERIC := 6; w_seasonal NUMERIC := 4; w_montecarlo NUMERIC := 4;
  wf RECORD;
BEGIN
  -- Load dynamic weights from DB
  SELECT * INTO wf FROM get_factor_weights(turno_objetivo) LIMIT 1;
  IF FOUND THEN
    w_calor := wf.w_calor; w_demora := wf.w_demora; w_afinidad := wf.w_afinidad;
    w_markov := wf.w_markov; w_bayesian := wf.w_bayesian; w_entropy := wf.w_entropy;
    w_survival := wf.w_survival; w_cyclic := wf.w_cyclic; w_drift := wf.w_drift;
    w_correlation := wf.w_correlation; w_seasonal := wf.w_seasonal; w_montecarlo := wf.w_montecarlo;
  END IF;

  SELECT COUNT(*) INTO total_sorteos FROM draws;
  SELECT MOD(numbers[1], 100) INTO ultimo_numero_cabeza
  FROM draws ORDER BY date DESC, created_at DESC LIMIT 1;

  RETURN QUERY
  WITH base_numeros AS (
    SELECT num AS n FROM generate_series(0, 99) num
  ),
  frecuencia_reciente AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS apariciones
    FROM (SELECT numbers FROM draws WHERE turno = turno_objetivo ORDER BY date DESC LIMIT 100) d
    GROUP BY MOD(d.numbers[1], 100)
  ),
  demoras AS (
    SELECT n, MAX(ultimo_rank) AS atraso FROM (
      SELECT MOD(d.numbers[1], 100) AS n,
        ROW_NUMBER() OVER (ORDER BY d.date DESC) AS ultimo_rank
      FROM draws d WHERE d.turno = turno_objetivo
    ) sub GROUP BY n
  ),
  max_apariciones AS (SELECT COALESCE(MAX(apariciones), 1) AS max_ap FROM frecuencia_reciente),
  max_demora AS (SELECT COALESCE(MAX(atraso), 1) AS max_atraso FROM demoras),
  afinidad AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS veces_en_turno
    FROM draws d WHERE d.turno = turno_objetivo
    GROUP BY MOD(d.numbers[1], 100)
  ),
  max_afinidad AS (SELECT COALESCE(MAX(veces_en_turno), 1) AS max_af FROM afinidad),
  markov AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS transiciones
    FROM draws d WHERE d.turno = turno_objetivo
      AND MOD(d.numbers[1], 100) IN (
        SELECT MOD(numbers[2], 100) FROM draws WHERE turno = turno_objetivo ORDER BY date DESC LIMIT 1
      )
    GROUP BY MOD(d.numbers[1], 100)
  ),
  max_markov AS (SELECT COALESCE(MAX(transiciones), 1) AS max_tr FROM markov),
  -- Factor subqueries (reuse existing factor functions)
  bayesian_raw AS (SELECT numero, score FROM factor_bayesian(turno_objetivo)),
  entropy_raw AS (SELECT numero, score FROM factor_entropy(turno_objetivo)),
  survival_raw AS (SELECT numero, score FROM factor_survival(turno_objetivo)),
  cyclic_raw AS (SELECT numero, score FROM factor_cyclic(turno_objetivo)),
  drift_raw AS (SELECT numero, score FROM factor_drift(turno_objetivo)),
  correlation_raw AS (SELECT numero, score FROM factor_correlation(turno_objetivo)),
  seasonal_raw AS (SELECT numero, score FROM factor_seasonal(turno_objetivo)),
  montecarlo_raw AS (SELECT numero, score FROM factor_montecarlo(turno_objetivo)),
  max_bayesian AS (SELECT COALESCE(MAX(score), 1) AS ms FROM bayesian_raw),
  max_entropy AS (SELECT COALESCE(MAX(score), 1) AS ms FROM entropy_raw),
  max_survival AS (SELECT COALESCE(MAX(score), 1) AS ms FROM survival_raw),
  max_cyclic AS (SELECT COALESCE(MAX(score), 1) AS ms FROM cyclic_raw),
  max_drift AS (SELECT COALESCE(MAX(score), 1) AS ms FROM drift_raw),
  max_correlation AS (SELECT COALESCE(MAX(score), 1) AS ms FROM correlation_raw),
  max_seasonal AS (SELECT COALESCE(MAX(score), 1) AS ms FROM seasonal_raw),
  max_montecarlo AS (SELECT COALESCE(MAX(score), 1) AS ms FROM montecarlo_raw)

  SELECT
    bn.n AS numero,
    (
      COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * w_calor, 0) +
      COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * w_demora, 0) +
      COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * w_afinidad, 0) +
      COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * w_markov, 0) +
      COALESCE((br.score / (SELECT ms FROM max_bayesian)) * w_bayesian, 0) +
      COALESCE((er.score / (SELECT ms FROM max_entropy)) * w_entropy, 0) +
      COALESCE((sr.score / (SELECT ms FROM max_survival)) * w_survival, 0) +
      COALESCE((cr.score / (SELECT ms FROM max_cyclic)) * w_cyclic, 0) +
      COALESCE((dr.score / (SELECT ms FROM max_drift)) * w_drift, 0) +
      COALESCE((cr2.score / (SELECT ms FROM max_correlation)) * w_correlation, 0) +
      COALESCE((snr.score / (SELECT ms FROM max_seasonal)) * w_seasonal, 0) +
      COALESCE((mr.score / (SELECT ms FROM max_montecarlo)) * w_montecarlo, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * 100, 0)::NUMERIC(5,2) AS f_calor,
    COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * 100, 0)::NUMERIC(5,2) AS f_demora,
    COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * 100, 0)::NUMERIC(5,2) AS f_afinidad,
    COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((br.score / (SELECT ms FROM max_bayesian)) * 100, 0)::NUMERIC(5,2) AS f_bayesian,
    COALESCE((er.score / (SELECT ms FROM max_entropy)) * 100, 0)::NUMERIC(5,2) AS f_entropy,
    COALESCE((sr.score / (SELECT ms FROM max_survival)) * 100, 0)::NUMERIC(5,2) AS f_survival,
    COALESCE((cr.score / (SELECT ms FROM max_cyclic)) * 100, 0)::NUMERIC(5,2) AS f_cyclic,
    COALESCE((dr.score / (SELECT ms FROM max_drift)) * 100, 0)::NUMERIC(5,2) AS f_drift,
    COALESCE((cr2.score / (SELECT ms FROM max_correlation)) * 100, 0)::NUMERIC(5,2) AS f_correlation,
    COALESCE((snr.score / (SELECT ms FROM max_seasonal)) * 100, 0)::NUMERIC(5,2) AS f_seasonal,
    COALESCE((mr.score / (SELECT ms FROM max_montecarlo)) * 100, 0)::NUMERIC(5,2) AS f_montecarlo
  FROM base_numeros bn
  LEFT JOIN frecuencia_reciente fr ON bn.n = fr.n
  LEFT JOIN demoras dm ON bn.n = dm.n
  LEFT JOIN afinidad af ON bn.n = af.n
  LEFT JOIN markov mk ON bn.n = mk.n
  LEFT JOIN bayesian_raw br ON bn.n = br.numero
  LEFT JOIN entropy_raw er ON bn.n = er.numero
  LEFT JOIN survival_raw sr ON bn.n = sr.numero
  LEFT JOIN cyclic_raw cr ON bn.n = cr.numero
  LEFT JOIN drift_raw dr ON bn.n = dr.numero
  LEFT JOIN correlation_raw cr2 ON bn.n = cr2.numero
  LEFT JOIN seasonal_raw snr ON bn.n = snr.numero
  LEFT JOIN montecarlo_raw mr ON bn.n = mr.numero
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── 6. Recreate refresh_cached_predictions (uses enhanced engine) ──
CREATE OR REPLACE FUNCTION refresh_cached_predictions(turno_objetivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pred_date DATE;
  top10 JSONB;
  redoblona_data JSONB;
  cabeza_num INT;
  total_draws INT;
  redoblona_res RECORD;
BEGIN
  pred_date := CURRENT_DATE;

  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (
    SELECT * FROM calcular_prediccion_enhanced(turno_objetivo)
  ) t;

  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (
          SELECT * FROM calcular_redoblona_premium(cabeza_num, turno_objetivo)
        ) r
      )
    ) INTO redoblona_res;

    redoblona_data := row_to_json(redoblona_res)::JSONB;
  ELSE
    redoblona_data := NULL;
  END IF;

  INSERT INTO cached_predictions (turno, prediction_date, numeros, redoblona, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(top10, '[]'::JSONB), redoblona_data, total_draws, now())
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    redoblona = EXCLUDED.redoblona,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();
END;
$$;
