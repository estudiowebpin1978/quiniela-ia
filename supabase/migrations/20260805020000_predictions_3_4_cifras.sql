-- ============================================================
-- MIGRATION: Engine Omega v3 — 3 & 4 Cifras Predictions
-- Date: 2026-08-05
-- Description: Adds full factor-based prediction engine for
--   3-digit and 4-digit number sequences. Previously these
--   used simple frequency counting on 150 draws only.
--   Now uses ALL draws with 6-factor ensemble analysis.
-- ============================================================

-- ── Helper: pad_num (zero-pad to 2 digits) ──────────────────
CREATE OR REPLACE FUNCTION pad_num(n INT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT LPAD(CAST(n AS TEXT), 2, '0')
$$;

-- ── Helper: extract consecutive pairs from a draw ───────────
-- Given numbers [01, 15, 42, 67, 89], produces:
--   3-cifras keys: "011", "154", "426", "678" (first 3 digits of each pair)
--   4-cifras keys: "0115", "1542", "4267", "6789" (full pairs)
-- Plus wrap-around: "890" (last+first) for 3-cifras, "8901" for 4-cifras

-- ============================================================
-- FUNCTION: calcular_prediccion_3cifras
-- 6-factor ensemble for 3-digit sequences:
--   Freq (25%) + Recency (20%) + Markov (15%) + Bayesian (15%) + Survival (15%) + Cyclic (10%)
-- ============================================================
DROP FUNCTION IF EXISTS calcular_prediccion_3cifras(text);
CREATE OR REPLACE FUNCTION calcular_prediccion_3cifras(turno_objetivo TEXT)
RETURNS TABLE (
  numero TEXT,
  puntaje_total NUMERIC,
  f_frecuencia NUMERIC,
  f_recencia NUMERIC,
  f_markov NUMERIC,
  f_bayesiano NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  w_freq NUMERIC := 25;
  w_rec NUMERIC := 20;
  w_mark NUMERIC := 15;
  w_bay NUMERIC := 15;
  w_surv NUMERIC := 15;
  w_cyc NUMERIC := 10;
BEGIN
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  RETURN QUERY
  WITH all_draws AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  -- Extract all 3-digit sequences from consecutive pairs
  all_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(pad_num(d.numbers[i]) FROM 1 FOR 3) AS seq3,
      SUBSTRING(pad_num(d.numbers[i]) FROM 1 FOR 4) AS pair4,
      d.date
    FROM all_draws d,
         generate_subscripts(d.numbers, 1) AS i
    WHERE i <= array_length(d.numbers, 1)
  ),
  -- Also add wrap-around sequences (last num + first num of NEXT draw)
  wrap_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(pad_num(d.numbers[array_length(d.numbers, 1)]) FROM 1 FOR 2) ||
        SUBSTRING(pad_num(d2.numbers[1]) FROM 1 FOR 2) AS pair4_wrap,
      d.date
    FROM all_draws d
    JOIN all_draws d2 ON d2.rn = d.rn - 1
    WHERE d.rn > 1
  ),
  combined AS (
    SELECT rn, seq3 AS seq, date FROM all_sequences
    WHERE seq3 ~ '^[0-9]{3}$'
    UNION ALL
    SELECT rn, SUBSTRING(pair4_wrap FROM 1 FOR 3) AS seq, date FROM wrap_sequences
    WHERE SUBSTRING(pair4_wrap FROM 1 FOR 3) ~ '^[0-9]{3}$'
  ),
  -- Factor 1: Frequency (total appearances)
  freq AS (
    SELECT seq AS n, COUNT(*) AS appearances
    FROM combined
    GROUP BY seq
  ),
  max_freq AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM freq),
  -- Factor 2: Recency (weight recent more, exponential decay)
  recency AS (
    SELECT seq AS n, SUM(EXP(-0.03 * rn)) AS recency_score
    FROM combined
    GROUP BY seq
  ),
  max_rec AS (SELECT COALESCE(MAX(recency_score), 1) AS mx FROM recency),
  -- Factor 3: Markov (transitions from last pair)
  last_pair AS (
    SELECT SUBSTRING(pad_num(numbers[array_length(numbers,1)]) FROM 1 FOR 2) AS tail
    FROM draws WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  markov AS (
    SELECT c.seq AS n, COUNT(*) AS transitions
    FROM combined c, last_pair lp
    WHERE SUBSTRING(c.seq FROM 1 FOR 2) = lp.tail
    GROUP BY c.seq
  ),
  max_mark AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  -- Factor 4: Bayesian posterior (Dirichlet-Multinomial)
  bayesian AS (
    SELECT seq AS n,
      (COUNT(*) + 1.0) / (total_draws + 1000.0) AS posterior
    FROM combined
    GROUP BY seq
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  -- Factor 5: Survival (draws since last appearance)
  last_appearance AS (
    SELECT seq AS n, MIN(rn) AS last_rn
    FROM combined
    GROUP BY seq
  ),
  survival AS (
    SELECT la.n, la.last_rn AS survival_score
    FROM last_appearance la
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  -- Factor 6: Cyclic (periodicity - appears every N draws)
  cyclic AS (
    SELECT seq AS n,
      CASE WHEN COUNT(*) > 1 THEN
        (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC
      END AS cycle_length
    FROM combined
    GROUP BY seq
  ),
  max_cyc AS (SELECT COALESCE(MAX(ABS(10 - cycle_length)), 1) AS mx FROM cyclic)

  SELECT
    f.n AS numero,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((ABS(10 - c.cycle_length) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((ABS(10 - c.cycle_length) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
  FROM freq f
  LEFT JOIN recency r ON f.n = r.n
  LEFT JOIN markov mk ON f.n = mk.n
  LEFT JOIN bayesian b ON f.n = b.n
  LEFT JOIN survival s ON f.n = s.n
  LEFT JOIN cyclic c ON f.n = c.n
  CROSS JOIN max_freq mf
  CROSS JOIN max_rec mr
  CROSS JOIN max_mark mm
  CROSS JOIN max_bay mb
  CROSS JOIN max_surv ms
  CROSS JOIN max_cyc mc
  WHERE f.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- FUNCTION: calcular_prediccion_4cifras
-- Same 6-factor ensemble for 4-digit sequences
-- ============================================================
DROP FUNCTION IF EXISTS calcular_prediccion_4cifras(text);
CREATE OR REPLACE FUNCTION calcular_prediccion_4cifras(turno_objetivo TEXT)
RETURNS TABLE (
  numero TEXT,
  puntaje_total NUMERIC,
  f_frecuencia NUMERIC,
  f_recencia NUMERIC,
  f_markov NUMERIC,
  f_bayesiano NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  w_freq NUMERIC := 25;
  w_rec NUMERIC := 20;
  w_mark NUMERIC := 15;
  w_bay NUMERIC := 15;
  w_surv NUMERIC := 15;
  w_cyc NUMERIC := 10;
BEGIN
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  RETURN QUERY
  WITH all_draws AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  all_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(pad_num(d.numbers[i]) FROM 1 FOR 2) ||
        SUBSTRING(pad_num(d.numbers[i+1]) FROM 1 FOR 2) AS seq4,
      d.date
    FROM all_draws d,
         generate_subscripts(d.numbers, 1) AS i
    WHERE i < array_length(d.numbers, 1)
  ),
  wrap_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(pad_num(d.numbers[array_length(d.numbers, 1)]) FROM 1 FOR 2) ||
        SUBSTRING(pad_num(d2.numbers[1]) FROM 1 FOR 2) AS seq4_wrap,
      d.date
    FROM all_draws d
    JOIN all_draws d2 ON d2.rn = d.rn - 1
    WHERE d.rn > 1
  ),
  combined AS (
    SELECT rn, seq4 AS seq, date FROM all_sequences WHERE seq4 ~ '^[0-9]{4}$'
    UNION ALL
    SELECT rn, seq4_wrap AS seq, date FROM wrap_sequences WHERE seq4_wrap ~ '^[0-9]{4}$'
  ),
  freq AS (
    SELECT seq AS n, COUNT(*) AS appearances FROM combined GROUP BY seq
  ),
  max_freq AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM freq),
  recency AS (
    SELECT seq AS n, SUM(EXP(-0.03 * rn)) AS recency_score FROM combined GROUP BY seq
  ),
  max_rec AS (SELECT COALESCE(MAX(recency_score), 1) AS mx FROM recency),
  last_pair AS (
    SELECT SUBSTRING(pad_num(numbers[array_length(numbers,1)]) FROM 1 FOR 2) AS tail
    FROM draws WHERE turno = turno_objetivo ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  markov AS (
    SELECT c.seq AS n, COUNT(*) AS transitions
    FROM combined c, last_pair lp
    WHERE SUBSTRING(c.seq FROM 1 FOR 2) = lp.tail
    GROUP BY c.seq
  ),
  max_mark AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  bayesian AS (
    SELECT seq AS n, (COUNT(*) + 1.0) / (total_draws + 10000.0) AS posterior
    FROM combined GROUP BY seq
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  last_appearance AS (
    SELECT seq AS n, MIN(rn) AS last_rn FROM combined GROUP BY seq
  ),
  survival AS (
    SELECT la.n, la.last_rn AS survival_score FROM last_appearance la
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  cyclic AS (
    SELECT seq AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM combined GROUP BY seq
  ),
  max_cyc AS (SELECT COALESCE(MAX(ABS(10 - cycle_length)), 1) AS mx FROM cyclic)

  SELECT
    f.n AS numero,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((ABS(10 - c.cycle_length) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((ABS(10 - c.cycle_length) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
  FROM freq f
  LEFT JOIN recency r ON f.n = r.n
  LEFT JOIN markov mk ON f.n = mk.n
  LEFT JOIN bayesian b ON f.n = b.n
  LEFT JOIN survival s ON f.n = s.n
  LEFT JOIN cyclic c ON f.n = c.n
  CROSS JOIN max_freq mf
  CROSS JOIN max_rec mr
  CROSS JOIN max_mark mm
  CROSS JOIN max_bay mb
  CROSS JOIN max_surv ms
  CROSS JOIN max_cyc mc
  WHERE f.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── Cache tables for 3 and 4 cifras ─────────────────────────
CREATE TABLE IF NOT EXISTS cached_predictions_3cifras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  numeros JSONB NOT NULL,
  total_sorteos_analizados INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno, prediction_date)
);
CREATE INDEX IF NOT EXISTS idx_cp3_turno_date ON cached_predictions_3cifras (turno, prediction_date DESC);

CREATE TABLE IF NOT EXISTS cached_predictions_4cifras (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  numeros JSONB NOT NULL,
  total_sorteos_analizados INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno, prediction_date)
);
CREATE INDEX IF NOT EXISTS idx_cp4_turno_date ON cached_predictions_4cifras (turno, prediction_date DESC);

ALTER TABLE cached_predictions_3cifras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cp3" ON cached_predictions_3cifras FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_cp3" ON cached_predictions_3cifras FOR SELECT USING (true);

ALTER TABLE cached_predictions_4cifras ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_cp4" ON cached_predictions_4cifras FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "public_read_cp4" ON cached_predictions_4cifras FOR SELECT USING (true);

-- ── Refresh function for 3 and 4 cifras ─────────────────────
DROP FUNCTION IF EXISTS refresh_cached_predictions_3_4(text);
CREATE OR REPLACE FUNCTION refresh_cached_predictions_3_4(turno_objetivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pred_date DATE;
  total_draws INT;
BEGIN
  pred_date := CURRENT_DATE;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- 3 cifras
  INSERT INTO cached_predictions_3cifras (turno, prediction_date, numeros, total_sorteos_analizados, calculated_at)
  SELECT turno_objetivo, pred_date,
    COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB),
    total_draws, now()
  FROM (SELECT * FROM calcular_prediccion_3cifras(turno_objetivo)) t
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();

  -- 4 cifras
  INSERT INTO cached_predictions_4cifras (turno, prediction_date, numeros, total_sorteos_analizados, calculated_at)
  SELECT turno_objetivo, pred_date,
    COALESCE(jsonb_agg(row_to_json(t)), '[]'::JSONB),
    total_draws, now()
  FROM (SELECT * FROM calcular_prediccion_4cifras(turno_objetivo)) t
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();
END;
$$;

-- ── Trigger: auto-refresh 3/4 cifras after draw insert ──────
CREATE OR REPLACE FUNCTION trigger_refresh_predictions_3_4()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM refresh_cached_predictions_3_4(NEW.turno);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_refresh_predictions_3_4 ON draws;
CREATE TRIGGER auto_refresh_predictions_3_4
  AFTER INSERT OR UPDATE OF numbers ON draws
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_predictions_3_4();
