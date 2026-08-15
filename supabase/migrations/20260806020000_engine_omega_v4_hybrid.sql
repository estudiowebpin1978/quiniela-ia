-- ============================================================
-- ENGINE OMEGA v4: Hybrid Dual Engine (On-Demand)
-- Two engines merge: Táctico (60%) + Estratégico (40%)
-- Reads 100% of draws table, no cache dependency.
-- ============================================================

-- Recommended indexes (run once)
CREATE INDEX IF NOT EXISTS idx_draws_turno_date ON draws (turno, date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_draws_date_turno ON draws (date, turno);
CREATE INDEX IF NOT EXISTS idx_draws_jurisdiccion ON draws (jurisdiccion, date DESC);

DROP FUNCTION IF EXISTS calculate_omega_hybrid(text, text);
CREATE OR REPLACE FUNCTION calculate_omega_hybrid(
  target_turno TEXT,
  user_tier TEXT DEFAULT 'free'
)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  score_tactico NUMERIC,
  score_estrategico NUMERIC,
  f_calor NUMERIC,
  f_demora NUMERIC,
  f_markov NUMERIC,
  f_entropia NUMERIC,
  f_momentum NUMERIC,
  f_decaimiento NUMERIC,
  f_frecuencia NUMERIC,
  f_atraso_real NUMERIC,
  f_bayesian NUMERIC,
  f_supervivencia NUMERIC,
  f_ciclico NUMERIC,
  f_correlacion NUMERIC,
  prediccion_2cifras TEXT,
  prediccion_3cifras JSONB,
  prediccion_4cifras JSONB,
  redoblona JSONB
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  total_draws INT;
  juris_target TEXT;
  w_tactico CONSTANT NUMERIC := 0.60;
  w_estrategico CONSTANT NUMERIC := 0.40;
BEGIN
  -- Determine jurisdiction for cross-jurisdiccion factor
  juris_target := CASE WHEN target_turno IN ('Primera', 'Nocturna') THEN 'provincia' ELSE 'nacional' END;

  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = target_turno;

  RETURN QUERY
  -- ========================================================
  -- SHARED: Number universe + row numbering
  -- ========================================================
  WITH all_draws AS (
    SELECT id, numbers, date, created_at, jurisdiccion,
      ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = target_turno
  ),
  all_numbers AS (
    SELECT rn, date, MOD(unnest(numbers), 100) AS num
    FROM all_draws
  ),
  -- Tactical window: last 200 draws
  tactical_draws AS (
    SELECT * FROM all_draws WHERE rn <= 200
  ),
  tactical_numbers AS (
    SELECT rn, date, MOD(unnest(numbers), 100) AS num
    FROM tactical_draws
  ),

  -- ========================================================
  -- MOTOR TÁCTICO (60%) — Short-term momentum
  -- ========================================================

  -- T1: Calor Táctico — frequency in last 200 draws
  t_calor AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM tactical_numbers GROUP BY num
  ),
  t_max_calor AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM t_calor),

  -- T2: Demora Táctico — draws since last appearance in tactical window
  t_last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn
    FROM tactical_numbers GROUP BY num
  ),
  t_max_demora AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM t_last_appearances),

  -- T3: Markov Táctico — transitions from last head in recent draws
  t_last_head AS (
    SELECT MOD(numbers[1], 100) AS head
    FROM draws WHERE turno = target_turno
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  t_markov_transitions AS (
    SELECT MOD(unnest(numbers[2:5]), 100) AS n
    FROM draws WHERE turno = target_turno
      AND MOD(numbers[1], 100) = (SELECT head FROM t_last_head)
    ORDER BY date DESC LIMIT 100
  ),
  t_markov AS (
    SELECT n, COUNT(*) AS transitions
    FROM t_markov_transitions WHERE n IS NOT NULL GROUP BY n
  ),
  t_max_markov AS (SELECT COALESCE(MAX(transitions), 1) AS mx FROM t_markov),

  -- T4: Entropía Táctica — predictability of recent distribution
  t_entropy_counts AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM tactical_numbers GROUP BY num
  ),
  t_entropy_total AS (
    SELECT SUM(appearances)::NUMERIC AS total FROM t_entropy_counts
  ),
  t_entropy AS (
    SELECT tc.n,
      -SUM((tc.appearances::NUMERIC / te.total) * LN(tc.appearances::NUMERIC / te.total + 0.0001)) AS entropy_val
    FROM t_entropy_counts tc, t_entropy_total te
    GROUP BY tc.n
  ),
  t_max_entropy AS (SELECT COALESCE(MAX(entropy_val), 1) AS mx FROM t_entropy),

  -- T5: Momentum — recent (20) vs mid (20-100) distribution shift
  t_recent AS (
    SELECT num AS n, COUNT(*) AS cnt FROM tactical_numbers WHERE rn <= 20 GROUP BY num
  ),
  t_mid AS (
    SELECT num AS n, COUNT(*) AS cnt FROM tactical_numbers WHERE rn BETWEEN 21 AND 100 GROUP BY num
  ),
  t_momentum AS (
    SELECT COALESCE(r.n, m.n) AS n,
      ABS(COALESCE(r.cnt, 0)::NUMERIC / 20 - COALESCE(m.cnt, 0)::NUMERIC / 80) AS momentum_val
    FROM t_recent r FULL OUTER JOIN t_mid m ON r.n = m.n
  ),
  t_max_momentum AS (SELECT COALESCE(MAX(momentum_val), 0.001) AS mx FROM t_momentum),

  -- T6: Decaimiento — exponential decay favoring recent appearances
  t_decaimiento AS (
    SELECT num AS n, SUM(EXP(-0.015 * rn)) AS decay_score
    FROM tactical_numbers GROUP BY num
  ),
  t_max_decaimiento AS (SELECT COALESCE(MAX(decay_score), 1) AS mx FROM t_decaimiento),

  -- ========================================================
  -- MOTOR ESTRATÉGICO (40%) — Long-term statistical truth
  -- ========================================================

  -- S1: Frecuencia Absoluta — all-time frequency
  s_frecuencia AS (
    SELECT num AS n, COUNT(*) AS appearances
    FROM all_numbers GROUP BY num
  ),
  s_max_frecuencia AS (SELECT COALESCE(MAX(appearances), 1) AS mx FROM s_frecuencia),

  -- S2: Atraso Real — real overdue across full history
  s_last_appearances AS (
    SELECT num AS n, MIN(rn) AS last_rn
    FROM all_numbers GROUP BY num
  ),
  s_max_atraso AS (SELECT COALESCE(MAX(last_rn), 1) AS mx FROM s_last_appearances),

  -- S3: Bayesian — posterior probability (Dirichlet-Multinomial)
  s_bayesian AS (
    SELECT num AS n, (COUNT(*) + 1.0) / (total_draws + 100.0) AS posterior
    FROM all_numbers GROUP BY num
  ),
  s_max_bayesian AS (SELECT COALESCE(MAX(posterior), 0.001) AS mx FROM s_bayesian),

  -- S4: Supervivencia — Z-score of current gap vs historical mean gap
  s_gaps AS (
    SELECT num AS n, rn,
      rn - LAG(rn) OVER (PARTITION BY num ORDER BY rn) AS gap
    FROM all_numbers
  ),
  s_survival_stats AS (
    SELECT n, AVG(gap) AS mean_gap, STDDEV(gap) AS std_gap
    FROM s_gaps WHERE gap IS NOT NULL GROUP BY n
  ),
  s_supervivencia AS (
    SELECT la.n,
      CASE WHEN ss.std_gap > 0 THEN (la.last_rn - ss.mean_gap) / ss.std_gap ELSE 0 END AS zscore
    FROM s_last_appearances la LEFT JOIN s_survival_stats ss ON la.n = ss.n
  ),
  s_max_supervivencia AS (SELECT COALESCE(MAX(ABS(zscore)), 1) AS mx FROM s_supervivencia),

  -- S5: Cíclico — periodicity detection (ideal cycle ~10 draws)
  s_cyclic_raw AS (
    SELECT num AS n,
      CASE WHEN COUNT(*) > 1 THEN (MAX(rn) - MIN(rn))::NUMERIC / (COUNT(*) - 1)
      ELSE total_draws::NUMERIC END AS cycle_length
    FROM all_numbers GROUP BY num
  ),
  s_ciclico AS (
    SELECT n, 1.0 / (1.0 + ABS(10 - cycle_length)) AS cyclic_score
    FROM s_cyclic_raw
  ),
  s_max_ciclico AS (SELECT COALESCE(MAX(cyclic_score), 0.001) AS mx FROM s_ciclico),

  -- S6: Correlación — co-occurrence with top-3 most frequent numbers
  s_top3 AS (
    SELECT num AS n FROM all_numbers GROUP BY num ORDER BY COUNT(*) DESC LIMIT 3
  ),
  s_correlacion AS (
    SELECT an.num AS n, COUNT(*) AS co_count
    FROM all_numbers an
    JOIN all_numbers an2 ON an.rn = an2.rn
      AND an2.num IN (SELECT n FROM s_top3)
      AND an.num != an2.num
    WHERE an.num IN (SELECT n FROM s_frecuencia)
    GROUP BY an.num
  ),
  s_max_correlacion AS (SELECT COALESCE(MAX(co_count), 1) AS mx FROM s_correlacion),

  -- ========================================================
  -- SINTETIZADOR: Merge both engines
  -- ========================================================
  tactical_scores AS (
    SELECT
      bn.n AS numero,
      -- Normalize each factor to 0-1, apply tactical weights (sum=100)
      COALESCE(tc.appearances::NUMERIC / tmc.mx, 0) * 20 AS s_calor,
      COALESCE(tla.last_rn::NUMERIC / tmd.mx, 0) * 25 AS s_demora,
      COALESCE(mk.transitions::NUMERIC / tmm.mx, 0) * 18 AS s_markov,
      COALESCE((1 - te.entropy_val / tme.mx), 0) * 15 AS s_entropia,
      COALESCE(tm.momentum_val / tmmo.mx, 0) * 12 AS s_momentum,
      COALESCE(td.decay_score / tmdc.mx, 0) * 10 AS s_decaimiento
    FROM (SELECT num AS n FROM generate_series(0, 99) num) bn
    LEFT JOIN t_calor tc ON bn.n = tc.n
    LEFT JOIN t_last_appearances tla ON bn.n = tla.n
    LEFT JOIN t_markov mk ON bn.n = mk.n
    LEFT JOIN t_entropy te ON bn.n = te.n
    LEFT JOIN t_momentum tm ON bn.n = tm.n
    LEFT JOIN t_decaimiento td ON bn.n = td.n
    CROSS JOIN t_max_calor tmc
    CROSS JOIN t_max_demora tmd
    CROSS JOIN t_max_markov tmm
    CROSS JOIN t_max_entropy tme
    CROSS JOIN t_max_momentum tmmo
    CROSS JOIN t_max_decaimiento tmdc
  ),
  strategic_scores AS (
    SELECT
      bn.n AS numero,
      -- Normalize each factor to 0-1, apply strategic weights (sum=100)
      COALESCE(sf.appearances::NUMERIC / smf.mx, 0) * 20 AS s_frecuencia,
      COALESCE(sla.last_rn::NUMERIC / sma.mx, 0) * 22 AS s_atraso_real,
      COALESCE(sb.posterior / smb.mx, 0) * 15 AS s_bayesian,
      COALESCE(ABS(ss.zscore) / sms.mx, 0) * 18 AS s_supervivencia,
      COALESCE(sc.cyclic_score / smc.mx, 0) * 12 AS s_ciclico,
      COALESCE(COALESCE(scr.co_count, 0)::NUMERIC / smcr.mx, 0) * 13 AS s_correlacion
    FROM (SELECT num AS n FROM generate_series(0, 99) num) bn
    LEFT JOIN s_frecuencia sf ON bn.n = sf.n
    LEFT JOIN s_last_appearances sla ON bn.n = sla.n
    LEFT JOIN s_bayesian sb ON bn.n = sb.n
    LEFT JOIN s_supervivencia ss ON bn.n = ss.n
    LEFT JOIN s_ciclico sc ON bn.n = sc.n
    LEFT JOIN s_correlacion scr ON bn.n = scr.n
    CROSS JOIN s_max_frecuencia smf
    CROSS JOIN s_max_atraso sma
    CROSS JOIN s_max_bayesian smb
    CROSS JOIN s_max_supervivencia sms
    CROSS JOIN s_max_ciclico smc
    CROSS JOIN s_max_correlacion smcr
  ),
  merged AS (
    SELECT
      t.numero,
      -- Tactical score (0-100)
      (t.s_calor + t.s_demora + t.s_markov + t.s_entropia + t.s_momentum + t.s_decaimiento)::NUMERIC(5,2) AS score_tactico,
      -- Strategic score (0-100)
      (s.s_frecuencia + s.s_atraso_real + s.s_bayesian + s.s_supervivencia + s.s_ciclico + s.s_correlacion)::NUMERIC(5,2) AS score_estrategico,
      -- Individual factor scores (normalized 0-100 for display)
      (t.s_calor / 20 * 100)::NUMERIC(5,2) AS f_calor,
      (t.s_demora / 25 * 100)::NUMERIC(5,2) AS f_demora,
      (t.s_markov / 18 * 100)::NUMERIC(5,2) AS f_markov,
      (t.s_entropia / 15 * 100)::NUMERIC(5,2) AS f_entropia,
      (t.s_momentum / 12 * 100)::NUMERIC(5,2) AS f_momentum,
      (t.s_decaimiento / 10 * 100)::NUMERIC(5,2) AS f_decaimiento,
      (s.s_frecuencia / 20 * 100)::NUMERIC(5,2) AS f_frecuencia,
      (s.s_atraso_real / 22 * 100)::NUMERIC(5,2) AS f_atraso_real,
      (s.s_bayesian / 15 * 100)::NUMERIC(5,2) AS f_bayesian,
      (s.s_supervivencia / 18 * 100)::NUMERIC(5,2) AS f_supervivencia,
      (s.s_ciclico / 12 * 100)::NUMERIC(5,2) AS f_ciclico,
      (s.s_correlacion / 13 * 100)::NUMERIC(5,2) AS f_correlacion
    FROM tactical_scores t
    JOIN strategic_scores s ON t.numero = s.numero
  ),
  final_scores AS (
    SELECT
      m.*,
      -- FINAL SCORE = Táctico (60%) + Estratégico (40%)
      (m.score_tactico * w_tactico + m.score_estrategico * w_estrategico)::NUMERIC(7,3) AS puntaje_total
    FROM merged m
  )

  SELECT
    fs.numero,
    fs.puntaje_total,
    fs.score_tactico,
    fs.score_estrategico,
    fs.f_calor,
    fs.f_demora,
    fs.f_markov,
    fs.f_entropia,
    fs.f_momentum,
    fs.f_decaimiento,
    fs.f_frecuencia,
    fs.f_atraso_real,
    fs.f_bayesian,
    fs.f_supervivencia,
    fs.f_ciclico,
    fs.f_correlacion,
    -- 2 cifras prediction (top 10)
    LPAD(fs.numero::TEXT, 2, '0') AS prediccion_2cifras,
    -- 3 cifras: generated from consecutive pairs
    (SELECT jsonb_agg(LPAD(n3::TEXT, 3, '0'))
     FROM (SELECT fs.numero * 100 + (SELECT MOD(numbers[1], 100) FROM draws WHERE turno = target_turno ORDER BY date DESC LIMIT 1) AS n3
           WHERE user_tier IN ('premium', 'admin')
           UNION ALL
           SELECT (SELECT MOD(numbers[1], 100) FROM draws WHERE turno = target_turno ORDER BY date DESC LIMIT 1) * 100 + fs.numero AS n3
           WHERE user_tier IN ('premium', 'admin')
    ) sub) AS prediccion_3cifras,
    -- 4 cifras: generated from consecutive triples
    (SELECT jsonb_agg(LPAD(n4::TEXT, 4, '0'))
     FROM (SELECT fs.numero * 1000 + (SELECT MOD(numbers[1], 100) FROM draws WHERE turno = target_turno ORDER BY date DESC LIMIT 1) * 100
           + (SELECT MOD(numbers[2], 100) FROM draws WHERE turno = target_turno ORDER BY date DESC LIMIT 1) AS n4
           WHERE user_tier IN ('premium', 'admin')
    ) sub) AS prediccion_4cifras,
    -- Redoblona: top companion numbers
    (SELECT jsonb_build_object(
      'cabeza', fs.numero,
      'acompanantes', (
        SELECT jsonb_agg(comp ORDER BY comp_count DESC)
        FROM (
          SELECT MOD(d.numbers[i], 100) AS comp, COUNT(*) AS comp_count
          FROM draws d, generate_subscripts(d.numbers, 1) AS i
          WHERE d.turno = target_turno
            AND i BETWEEN 2 AND 20
            AND MOD(d.numbers[1], 100) = fs.numero
          GROUP BY MOD(d.numbers[i], 100)
          ORDER BY comp_count DESC
          LIMIT 3
        ) sub2
      )
    )) AS redoblona
  FROM final_scores fs
  WHERE fs.puntaje_total > 0
  ORDER BY fs.puntaje_total DESC
  LIMIT 10;
END;
$$;
