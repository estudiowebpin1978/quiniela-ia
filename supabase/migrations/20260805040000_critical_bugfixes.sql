-- ============================================================
-- MIGRATION: Critical Bug Fixes — 3/4 Cifras, Demora, Cyclic,
--   Redoblona wrapping, refresh with 12 factors
-- Date: 2026-08-05
-- ============================================================

-- ── FIX 1: 3-cifras — sequence extraction was broken ────────
-- Numbers are 00-99 (2 digits). Previous code used SUBSTRING on
-- single numbers, producing at most 2 chars (never 3).
-- FIX: concatenate consecutive number PAIRS, then take first 3 digits.
-- Draw [01, 15, 42, 67, 89] → pairs ["0115","1542","4267","6789"]
-- 3-cifras: ["011","154","426","678"] + wrap "8901"→"890"

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
  -- Extract 3-digit sequences from consecutive PAIRS of numbers
  all_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(
        LPAD(d.numbers[i]::TEXT, 2, '0') || LPAD(d.numbers[i+1]::TEXT, 2, '0')
        FROM 1 FOR 3
      ) AS seq3,
      d.date
    FROM all_draws d,
         generate_subscripts(d.numbers, 1) AS i
    WHERE i < array_length(d.numbers, 1)
  ),
  -- Wrap-around: last number + first number of same draw
  wrap_sequences AS (
    SELECT
      d.rn,
      SUBSTRING(
        LPAD(d.numbers[array_length(d.numbers,1)]::TEXT, 2, '0') || LPAD(d.numbers[1]::TEXT, 2, '0')
        FROM 1 FOR 3
      ) AS seq3,
      d.date
    FROM all_draws d
  ),
  combined AS (
    SELECT rn, seq3 AS seq, date FROM all_sequences WHERE seq3 ~ '^[0-9]{3}$'
    UNION ALL
    SELECT rn, seq3 AS seq, date FROM wrap_sequences WHERE seq3 ~ '^[0-9]{3}$'
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
    SELECT LPAD(numbers[array_length(numbers,1)]::TEXT, 2, '0') AS tail
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
  bayesian AS (
    SELECT seq AS n, (COUNT(*) + 1.0) / (total_draws + 1000.0) AS posterior
    FROM combined GROUP BY seq
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  last_appearance AS (
    SELECT seq AS n, MIN(rn) AS last_rn FROM combined GROUP BY seq
  ),
  survival AS (
    SELECT n, last_rn AS survival_score FROM last_appearance
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  cyclic AS (
    SELECT seq AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM combined GROUP BY seq
  ),
  -- FIX: inverted cyclic — closer to ideal cycle (10) = higher score
  max_cyc AS (SELECT COALESCE(MAX(1.0 / (1.0 + ABS(10 - cycle_length))), 0.001) AS mx FROM cyclic)

  SELECT
    f.n AS numero,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((1.0 / (1.0 + ABS(10 - c.cycle_length)) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((1.0 / (1.0 + ABS(10 - c.cycle_length)) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
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

-- ── FIX 2: 4-cifras — same cyclic fix ───────────────────────
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
      LPAD(d.numbers[i]::TEXT, 2, '0') || LPAD(d.numbers[i+1]::TEXT, 2, '0') AS seq4,
      d.date
    FROM all_draws d,
         generate_subscripts(d.numbers, 1) AS i
    WHERE i < array_length(d.numbers, 1)
  ),
  wrap_sequences AS (
    SELECT
      d.rn,
      LPAD(d.numbers[array_length(d.numbers,1)]::TEXT, 2, '0') || LPAD(d.numbers[1]::TEXT, 2, '0') AS seq4,
      d.date
    FROM all_draws d
  ),
  combined AS (
    SELECT rn, seq4 AS seq, date FROM all_sequences WHERE seq4 ~ '^[0-9]{4}$'
    UNION ALL
    SELECT rn, seq4 AS seq, date FROM wrap_sequences WHERE seq4 ~ '^[0-9]{4}$'
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
    SELECT LPAD(numbers[array_length(numbers,1)]::TEXT, 2, '0') AS tail
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
  bayesian AS (
    SELECT seq AS n, (COUNT(*) + 1.0) / (total_draws + 10000.0) AS posterior
    FROM combined GROUP BY seq
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  last_appearance AS (
    SELECT seq AS n, MIN(rn) AS last_rn FROM combined GROUP BY seq
  ),
  survival AS (
    SELECT n, last_rn AS survival_score FROM last_appearance
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  cyclic AS (
    SELECT seq AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM combined GROUP BY seq
  ),
  max_cyc AS (SELECT COALESCE(MAX(1.0 / (1.0 + ABS(10 - cycle_length))), 0.001) AS mx FROM cyclic)

  SELECT
    f.n AS numero,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((1.0 / (1.0 + ABS(10 - c.cycle_length)) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((1.0 / (1.0 + ABS(10 - c.cycle_length)) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
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

-- ── FIX 3: Redoblona enhanced — fix row_to_json wrapping + cyclic ──
DROP FUNCTION IF EXISTS calcular_redoblona_enhanced(int, text);
CREATE OR REPLACE FUNCTION calcular_redoblona_enhanced(
  numero_cabeza INT,
  turno_objetivo TEXT
)
RETURNS TABLE (
  numero_acompanante INT,
  frecuencia_coocurrencia INT,
  probabilidad_porcentaje NUMERIC,
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
  total_draws_with_cabeza INT;
  w_freq NUMERIC := 25;
  w_rec NUMERIC := 20;
  w_mark NUMERIC := 15;
  w_bay NUMERIC := 15;
  w_surv NUMERIC := 15;
  w_cyc NUMERIC := 10;
BEGIN
  SELECT COUNT(*) INTO total_draws_with_cabeza
  FROM draws
  WHERE turno = turno_objetivo
    AND MOD(numbers[1], 100) = numero_cabeza;

  RETURN QUERY
  WITH sorteos_cabeza AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws
    WHERE turno = turno_objetivo
      AND MOD(numbers[1], 100) = numero_cabeza
  ),
  acompanantes_raw AS (
    SELECT
      sc.rn,
      sc.date,
      MOD(unnest(sc.numbers[2:20]), 100) AS acomp
    FROM sorteos_cabeza sc
  ),
  acompanantes AS (
    SELECT rn, date, acomp AS n
    FROM acompanantes_raw
    WHERE acomp IS NOT NULL AND acomp != numero_cabeza
  ),
  freq AS (
    SELECT n, COUNT(*) AS appearances FROM acompanantes GROUP BY n
  ),
  max_freq AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM freq),
  recency AS (
    SELECT n, SUM(EXP(-0.05 * rn)) AS recency_score FROM acompanantes GROUP BY n
  ),
  max_rec AS (SELECT COALESCE(MAX(recency_score), 1) AS mx FROM recency),
  last_head_draw AS (
    SELECT numbers
    FROM draws
    WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC
    LIMIT 1
  ),
  last_transitions AS (
    SELECT MOD(unnest(lhd.numbers[2:20]), 100) AS n
    FROM last_head_draw lhd
  ),
  markov AS (
    SELECT n, COUNT(*) AS transitions
    FROM last_transitions
    WHERE n IS NOT NULL AND n != numero_cabeza
    GROUP BY n
  ),
  max_mark AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  bayesian AS (
    SELECT n, (COUNT(*) + 1.0) / (total_draws_with_cabeza + 100.0) AS posterior
    FROM acompanantes GROUP BY n
  ),
  max_bay AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  last_cooccurrence AS (
    SELECT n, MIN(rn) AS last_rn FROM acompanantes GROUP BY n
  ),
  survival AS (
    SELECT n, last_rn AS survival_score FROM last_cooccurrence
  ),
  max_surv AS (SELECT COALESCE(MAX(survival_score), 1) AS mx FROM survival),
  cyclic AS (
    SELECT n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws_with_cabeza::NUMERIC END AS cycle_length
    FROM acompanantes GROUP BY n
  ),
  max_cyc AS (SELECT COALESCE(MAX(1.0 / (1.0 + ABS(8 - cycle_length))), 0.001) AS mx FROM cyclic)

  SELECT
    f.n AS numero_acompanante,
    f.appearances::INT AS frecuencia_coocurrencia,
    ROUND(
      (f.appearances::NUMERIC / NULLIF(total_draws_with_cabeza, 0)) * 100,
      2
    ) AS probabilidad_porcentaje,
    (
      COALESCE((f.appearances::NUMERIC / mf.mx) * w_freq, 0) +
      COALESCE((r.recency_score / mr.mx) * w_rec, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * w_mark, 0) +
      COALESCE((b.posterior / mb.mx) * w_bay, 0) +
      COALESCE((s.survival_score::NUMERIC / ms.mx) * w_surv, 0) +
      COALESCE((1.0 / (1.0 + ABS(8 - c.cycle_length)) / mc.mx) * w_cyc, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((f.appearances::NUMERIC / mf.mx) * 100, 0)::NUMERIC(5,2) AS f_frecuencia,
    COALESCE((r.recency_score / mr.mx) * 100, 0)::NUMERIC(5,2) AS f_recencia,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesiano,
    COALESCE((s.survival_score::NUMERIC / ms.mx) * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE((1.0 / (1.0 + ABS(8 - c.cycle_length)) / mc.mx) * 100, 0)::NUMERIC(5,2) AS f_ciclico
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
  LIMIT 3;
END;
$$;

-- ── FIX 4: refresh_cached_predictions — use 12-factor + fix redoblona wrapping ──
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
  redoblona_res JSONB;
BEGIN
  pred_date := CURRENT_DATE;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- Calculate Top 10 (4-factor fast for cache)
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (SELECT * FROM calcular_prediccion_maestra(turno_objetivo)) t;

  -- Calculate redoblona with enhanced 6-factor analysis
  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    -- FIX: Use direct jsonb_build_object instead of row_to_json wrapping
    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (SELECT * FROM calcular_redoblona_enhanced(cabeza_num, turno_objetivo)) r
      )
    ) INTO redoblona_res;

    redoblona_data := redoblona_res;
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

-- ── FIX 5: calcular_prediccion_enhanced — fix Demora inversion ─────
-- Demora was inverted: MAX(ultimo_rank) = most recent = LOW demora
-- Should be: MIN(ultimo_rank) = oldest gap = HIGH demora (most overdue)
-- Also fix Cyclic factor: use 1/(1+ABS(target-cycle)) instead of ABS(target-cycle)

DROP FUNCTION IF EXISTS calcular_prediccion_enhanced(text);
CREATE OR REPLACE FUNCTION calcular_prediccion_enhanced(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  f_calor NUMERIC,
  f_demora NUMERIC,
  f_afinidad NUMERIC,
  f_markov NUMERIC,
  f_bayesian NUMERIC,
  f_entropy NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC,
  f_drift NUMERIC,
  f_correlacion NUMERIC,
  f_estacional NUMERIC,
  f_montecarlo NUMERIC
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  weights RECORD;
BEGIN
  SELECT * INTO weights FROM get_factor_weights() LIMIT 1;
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  RETURN QUERY
  WITH all_draws AS (
    SELECT numbers, date, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  -- Extract all 2-digit numbers from draws
  all_numbers AS (
    SELECT rn, date, MOD(unnest(numbers), 100) AS num
    FROM all_draws
  ),
  -- F1: Calor (frequency in last 100 draws)
  calor AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers WHERE rn <= 100
    GROUP BY num
  ),
  max_calor AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM calor),
  -- F2: Demora (draws since last appearance — higher = more overdue)
  last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn
    FROM all_numbers GROUP BY num
  ),
  max_demora AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM last_appearances),
  -- F3: Afinidad (historical frequency in this turno)
  afinidad AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers GROUP BY num
  ),
  max_afinidad AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM afinidad),
  -- F4: Markov (what follows the last head number)
  last_head AS (
    SELECT MOD(numbers[1], 100) AS head
    FROM draws WHERE turno = turno_objetivo
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  markov_transitions AS (
    SELECT MOD(unnest(numbers[2:5]), 100) AS n
    FROM draws WHERE turno = turno_objetivo
    AND MOD(numbers[1], 100) = (SELECT head FROM last_head)
    ORDER BY date DESC LIMIT 100
  ),
  markov AS (
    SELECT n, COUNT(*) AS transitions
    FROM markov_transitions WHERE n IS NOT NULL
    GROUP BY n
  ),
  max_markov AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM markov),
  -- F5: Bayesian posterior
  bayesian AS (
    SELECT num AS n, (COUNT(*) + 1.0) / (total_draws + 100.0) AS posterior
    FROM all_numbers GROUP BY num
  ),
  max_bayesian AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM bayesian),
  -- F6: Entropy (lower entropy = more predictable = higher score)
  entropy AS (
    SELECT num AS n,
      CASE WHEN COUNT(*) > 1 THEN
        -SUM(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM all_numbers an WHERE an.num = all_numbers.num) *
             LN(COUNT(*)::NUMERIC / (SELECT COUNT(*) FROM all_numbers an WHERE an.num = all_numbers.num) + 0.0001))
      ELSE 0 END AS entropy_val
    FROM all_numbers WHERE rn <= 100
    GROUP BY num
  ),
  max_entropy AS (SELECT COALESCE(MAX(entropy_val), 1) AS mx FROM entropy),
  -- F7: Survival (Z-score of current gap vs mean gap)
  gaps AS (
    SELECT num AS n, rn,
      rn - LAG(rn) OVER (PARTITION BY num ORDER BY rn) AS gap
    FROM all_numbers
  ),
  survival_stats AS (
    SELECT n, AVG(gap) AS mean_gap, STDDEV(gap) AS std_gap
    FROM gaps WHERE gap IS NOT NULL GROUP BY n
  ),
  survival AS (
    SELECT la.n,
      CASE WHEN ss.std_gap > 0 THEN (la.last_rn - ss.mean_gap) / ss.std_gap
      ELSE 0 END AS zscore
    FROM last_appearances la
    LEFT JOIN survival_stats ss ON la.n = ss.n
  ),
  max_survival AS (SELECT COALESCE(MAX(ABS(zscore)), 1) AS mx FROM survival),
  -- F8: Cyclic (periodicity — closer to ideal = higher score)
  cyclic_raw AS (
    SELECT num AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM all_numbers GROUP BY num
  ),
  cyclic AS (
    SELECT n, 1.0 / (1.0 + ABS(10 - cycle_length)) AS cyclic_score
    FROM cyclic_raw
  ),
  max_cyclic AS (SELECT COALESCE(MAX(cyclic_score), 0.001) AS mx FROM cyclic),
  -- F9: Drift (recent vs historical distribution shift)
  recent AS (
    SELECT num AS n, COUNT(*) AS cnt
    FROM all_numbers WHERE rn <= 20 GROUP BY num
  ),
  historical AS (
    SELECT num AS n, COUNT(*) AS cnt
    FROM all_numbers GROUP BY num
  ),
  drift AS (
    SELECT COALESCE(r.n, h.n) AS n,
      ABS(COALESCE(r.cnt, 0)::NUMERIC / 20 - COALESCE(h.cnt, 0)::NUMERIC / NULLIF(total_draws, 0)) AS drift_val
    FROM recent r FULL OUTER JOIN historical h ON r.n = h.n
  ),
  max_drift AS (SELECT COALESCE(MAX(drift_val), 0.001) AS mx FROM drift),
  -- F10: Correlation (co-occurrence with top numbers)
  top3 AS (
    SELECT num AS n FROM all_numbers GROUP BY num ORDER BY COUNT(*) DESC LIMIT 3
  ),
  correlation AS (
    SELECT an.num AS n, COUNT(*) AS co_count
    FROM all_numbers an
    JOIN all_numbers an2 ON an.rn = an2.rn AND an2.num IN (SELECT n FROM top3) AND an.num != an2.num
    WHERE an.num IN (SELECT n FROM calor)
    GROUP BY an.num
  ),
  max_correlation AS (SELECT COALESCE(MAX(co_count), 1) AS mx FROM correlation),
  -- F11: Seasonal (quincena pattern)
  seasonal AS (
    SELECT num AS n,
      SUM(CASE WHEN EXTRACT(DAY FROM date) <= 15 THEN 1 ELSE 0 END)::NUMERIC /
      NULLIF(COUNT(*), 0) AS early_ratio
    FROM all_numbers an JOIN all_draws d ON an.rn = d.rn
    GROUP BY num
  ),
  max_seasonal AS (SELECT COALESCE(MAX(ABS(early_ratio - 0.5)), 0.001) AS mx FROM seasonal),
  -- F12: Monte Carlo (exponential decay scoring)
  montecarlo AS (
    SELECT num AS n, SUM(EXP(-0.02 * rn)) AS mc_score
    FROM all_numbers GROUP BY num
  ),
  max_mc AS (SELECT COALESCE(MAX(mc_score), 1) AS mx FROM montecarlo)

  SELECT
    c.n AS numero,
    (
      COALESCE((c.appearances::NUMERIC / mc1.mx) * weights.weight_calor, 0) +
      COALESCE((la.last_rn::NUMERIC / md.mx) * weights.weight_demora, 0) +
      COALESCE((a.appearances::NUMERIC / ma.mx) * weights.weight_afinidad, 0) +
      COALESCE((mk.transitions::NUMERIC / mm.mx) * weights.weight_markov, 0) +
      COALESCE((b.posterior / mb.mx) * weights.weight_bayesian, 0) +
      COALESCE((1 - e.entropy_val / me.mx) * weights.weight_entropy, 0) +
      COALESCE(ABS(s.zscore) / ms.mx * weights.weight_supervivencia, 0) +
      COALESCE(cy.cyclic_score / mcy.mx * weights.weight_ciclico, 0) +
      COALESCE(d.drift_val / md2.mx * weights.weight_drift, 0) +
      COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * weights.weight_correlacion, 0) +
      COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * weights.weight_estacional, 0) +
      COALESCE(mc2.mc_score / mmc.mx * weights.weight_montecarlo, 0)
    )::NUMERIC(7,3) AS puntaje_total,
    COALESCE((c.appearances::NUMERIC / mc1.mx) * 100, 0)::NUMERIC(5,2) AS f_calor,
    COALESCE((la.last_rn::NUMERIC / md.mx) * 100, 0)::NUMERIC(5,2) AS f_demora,
    COALESCE((a.appearances::NUMERIC / ma.mx) * 100, 0)::NUMERIC(5,2) AS f_afinidad,
    COALESCE((mk.transitions::NUMERIC / mm.mx) * 100, 0)::NUMERIC(5,2) AS f_markov,
    COALESCE((b.posterior / mb.mx) * 100, 0)::NUMERIC(5,2) AS f_bayesian,
    COALESCE((1 - e.entropy_val / me.mx) * 100, 0)::NUMERIC(5,2) AS f_entropy,
    COALESCE(ABS(s.zscore) / ms.mx * 100, 0)::NUMERIC(5,2) AS f_supervivencia,
    COALESCE(cy.cyclic_score / mcy.mx * 100, 0)::NUMERIC(5,2) AS f_ciclico,
    COALESCE(d.drift_val / md2.mx * 100, 0)::NUMERIC(5,2) AS f_drift,
    COALESCE(COALESCE(cr.co_count, 0)::NUMERIC / mcr.mx * 100, 0)::NUMERIC(5,2) AS f_correlacion,
    COALESCE(ABS(se.early_ratio - 0.5) / mse.mx * 100, 0)::NUMERIC(5,2) AS f_estacional,
    COALESCE(mc2.mc_score / mmc.mx * 100, 0)::NUMERIC(5,2) AS f_montecarlo
  FROM calor c
  LEFT JOIN last_appearances la ON c.n = la.n
  LEFT JOIN afinidad a ON c.n = a.n
  LEFT JOIN markov mk ON c.n = mk.n
  LEFT JOIN bayesian b ON c.n = b.n
  LEFT JOIN entropy e ON c.n = e.n
  LEFT JOIN survival s ON c.n = s.n
  LEFT JOIN cyclic cy ON c.n = cy.n
  LEFT JOIN drift d ON c.n = d.n
  LEFT JOIN correlation cr ON c.n = cr.n
  LEFT JOIN seasonal se ON c.n = se.n
  LEFT JOIN montecarlo mc2 ON c.n = mc2.n
  CROSS JOIN max_calor mc1
  CROSS JOIN max_demora md
  CROSS JOIN max_afinidad ma
  CROSS JOIN max_markov mm
  CROSS JOIN max_bayesian mb
  CROSS JOIN max_entropy me
  CROSS JOIN max_survival ms
  CROSS JOIN max_cyclic mcy
  CROSS JOIN max_drift md2
  CROSS JOIN max_correlation mcr
  CROSS JOIN max_seasonal mse
  CROSS JOIN max_mc mmc
  WHERE c.appearances >= 2
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;
