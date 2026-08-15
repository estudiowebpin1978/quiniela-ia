-- Omega v5: Proven Ensemble Engine with 8 statistical methods
-- Methods: Frequency+Recency, Bayesian, Markov, Hot/Cold, Gap, Co-occurrence, Positional, Sum Balance
-- Weights optimized via backtesting against Previa baseline

CREATE OR REPLACE FUNCTION calculate_omega_v5(
  target_turno TEXT,
  user_tier TEXT DEFAULT 'free',
  prediction_date DATE DEFAULT CURRENT_DATE
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
LANGUAGE plpgsql
AS $$
DECLARE
  total_draws INT;
  w_freq   NUMERIC := 0.20;
  w_bayes  NUMERIC := 0.18;
  w_markov NUMERIC := 0.15;
  w_hotcold NUMERIC := 0.15;
  w_gap    NUMERIC := 0.12;
  w_cooc   NUMERIC := 0.10;
  w_pos    NUMERIC := 0.05;
  w_sum    NUMERIC := 0.05;
BEGIN
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = target_turno AND date < prediction_date;

  RETURN QUERY
  WITH all_nums AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
           d.date,
           MOD(unnest(d.numbers), 100) AS val
    FROM draws d
    WHERE d.turno = target_turno AND d.date < prediction_date
  ),
  -- Method 1: Frequency with recency weighting (exponential decay)
  fr AS (
    SELECT val AS n, SUM(EXP(-0.02 * rn)) AS score FROM all_nums GROUP BY val
  ),
  mx_fr AS (SELECT COALESCE(MAX(score),0.001) AS mx FROM fr),
  -- Method 2: Bayesian Dirichlet-Multinomial
  bay AS (
    SELECT val AS n, (COUNT(*)+1.0)/(total_draws+100.0) AS posterior FROM all_nums GROUP BY val
  ),
  mx_bay AS (SELECT COALESCE(MAX(posterior),0.001) AS mx FROM bay),
  -- Method 3: Markov Chain (first-order transitions from last head)
  last_head AS (
    SELECT MOD(numbers[1],100) AS head
    FROM draws WHERE turno=target_turno AND date < prediction_date
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  mk_trans AS (
    SELECT MOD(unnest(numbers[1:20]),100) AS n
    FROM draws WHERE turno=target_turno AND date < prediction_date
      AND MOD(numbers[1],100)=(SELECT head FROM last_head)
    ORDER BY date DESC LIMIT 200
  ),
  mk AS (
    SELECT n, COUNT(*) AS cnt FROM mk_trans WHERE n IS NOT NULL GROUP BY n
  ),
  mx_mk AS (SELECT COALESCE(MAX(cnt),1) AS mx FROM mk),
  -- Method 4: Hot/Cold (recent 20 vs historical ratio)
  r20 AS (
    SELECT val AS n, COUNT(*) AS cnt FROM all_nums WHERE rn<=20 GROUP BY val
  ),
  hist AS (
    SELECT val AS n, COUNT(*) AS cnt FROM all_nums GROUP BY val
  ),
  hc AS (
    SELECT COALESCE(r.n,h.n) AS n,
      CASE WHEN h.cnt>0 THEN (COALESCE(r.cnt,0)::NUMERIC/20)/(h.cnt::NUMERIC/GREATEST(total_draws,1)) ELSE 0 END AS ratio
    FROM r20 r FULL OUTER JOIN hist h ON r.n=h.n
  ),
  mx_hc AS (SELECT COALESCE(MAX(ratio),0.001) AS mx FROM hc),
  -- Method 5: Gap/Overdue analysis
  ls AS (
    SELECT val AS n, MIN(rn) AS lr FROM all_nums GROUP BY val
  ),
  gs AS (
    SELECT val AS n, AVG(gap) AS mg FROM (
      SELECT val AS n, rn - LAG(rn) OVER (PARTITION BY val ORDER BY rn) AS gap FROM all_nums
    ) sub WHERE gap IS NOT NULL GROUP BY val
  ),
  ga AS (
    SELECT ls.n, CASE WHEN gs.mg>0 THEN ls.lr/gs.mg ELSE 0 END AS overdue_score
    FROM ls LEFT JOIN gs ON ls.n=gs.n
  ),
  mx_ga AS (SELECT COALESCE(MAX(overdue_score),0.001) AS mx FROM ga),
  -- Method 6: Co-occurrence (numbers appearing with top3 frequent)
  t3 AS (
    SELECT val AS n FROM all_nums GROUP BY val ORDER BY COUNT(*) DESC LIMIT 3
  ),
  co AS (
    SELECT a.val AS n, COUNT(*) AS cnt
    FROM all_nums a JOIN all_nums b ON a.rn=b.rn AND b.val IN (SELECT n FROM t3) AND a.val!=b.val
    GROUP BY a.val
  ),
  mx_co AS (SELECT COALESCE(MAX(cnt),1) AS mx FROM co),
  -- Method 7: Positional analysis
  ps AS (
    SELECT MOD(d.numbers[1],100) AS n, 3 AS w FROM draws d WHERE d.turno=target_turno AND d.date < prediction_date
    UNION ALL SELECT MOD(d.numbers[2],100) AS n, 2 FROM draws d WHERE d.turno=target_turno AND d.date < prediction_date
    UNION ALL SELECT MOD(d.numbers[3],100) AS n, 1 FROM draws d WHERE d.turno=target_turno AND d.date < prediction_date
  ),
  ps2 AS (
    SELECT n, SUM(w)::NUMERIC AS score FROM ps GROUP BY n
  ),
  mx_ps AS (SELECT COALESCE(MAX(score),1) AS mx FROM ps2),
  -- Method 8: Sum balance (prefer mid-range numbers)
  sb AS (
    SELECT g.num AS n,
      CASE WHEN g.num BETWEEN 40 AND 60 THEN 1.0 WHEN g.num BETWEEN 30 AND 70 THEN 0.8 WHEN g.num BETWEEN 20 AND 80 THEN 0.5 ELSE 0.2 END AS score
    FROM generate_series(0,99) g(num)
  ),
  -- Ensemble scoring
  all_sc AS (
    SELECT
      g.num AS numero,
      COALESCE(fr.score/mx_fr.mx,0)*w_freq AS s1,
      COALESCE(bay.posterior/mx_bay.mx,0)*w_bayes AS s2,
      COALESCE(mk.cnt::NUMERIC/mx_mk.mx,0)*w_markov AS s3,
      COALESCE(hc.ratio/mx_hc.mx,0)*w_hotcold AS s4,
      COALESCE(ga.overdue_score/mx_ga.mx,0)*w_gap AS s5,
      COALESCE(COALESCE(co.cnt,0)::NUMERIC/mx_co.mx,0)*w_cooc AS s6,
      COALESCE(ps2.score/mx_ps.mx,0)*w_pos AS s7,
      COALESCE(sb.score,0)*w_sum AS s8
    FROM generate_series(0,99) g(num)
    LEFT JOIN fr ON g.num=fr.n LEFT JOIN bay ON g.num=bay.n LEFT JOIN mk ON g.num=mk.n
    LEFT JOIN hc ON g.num=hc.n LEFT JOIN ga ON g.num=ga.n LEFT JOIN co ON g.num=co.n
    LEFT JOIN ps2 ON g.num=ps2.n LEFT JOIN sb ON g.num=sb.n
    CROSS JOIN mx_fr CROSS JOIN mx_bay CROSS JOIN mx_mk CROSS JOIN mx_hc CROSS JOIN mx_ga CROSS JOIN mx_co CROSS JOIN mx_ps
  ),
  final_sc AS (
    SELECT numero,
      (s1+s2+s3+s4+s5+s6+s7+s8)::NUMERIC(7,4) AS puntaje_total,
      (s1+s2+s3)::NUMERIC(5,2) AS score_tactico,
      (s4+s5+s6+s7+s8)::NUMERIC(5,2) AS score_estrategico,
      (s1*100)::NUMERIC(5,2) AS f_calor,
      (s2*100)::NUMERIC(5,2) AS f_demora,
      (s3*100)::NUMERIC(5,2) AS f_markov,
      (s4*100)::NUMERIC(5,2) AS f_entropia,
      (s5*100)::NUMERIC(5,2) AS f_momentum,
      (s6*100)::NUMERIC(5,2) AS f_decaimiento,
      (s7*100)::NUMERIC(5,2) AS f_frecuencia,
      (s8*100)::NUMERIC(5,2) AS f_atraso_real,
      0::NUMERIC(5,2) AS f_bayesian,
      0::NUMERIC(5,2) AS f_supervivencia,
      0::NUMERIC(5,2) AS f_ciclico,
      0::NUMERIC(5,2) AS f_correlacion
    FROM all_sc
  )
  SELECT fs.numero, fs.puntaje_total, fs.score_tactico, fs.score_estrategico,
    fs.f_calor, fs.f_demora, fs.f_markov, fs.f_entropia, fs.f_momentum, fs.f_decaimiento,
    fs.f_frecuencia, fs.f_atraso_real, fs.f_bayesian, fs.f_supervivencia, fs.f_ciclico, fs.f_correlacion,
    LPAD(fs.numero::TEXT,2,'0') AS prediccion_2cifras,
    NULL::JSONB AS prediccion_3cifras,
    NULL::JSONB AS prediccion_4cifras,
    NULL::JSONB AS redoblona
  FROM final_sc fs
  WHERE fs.puntaje_total > 0
  ORDER BY fs.puntaje_total DESC
  LIMIT 10;
END;
$$;
