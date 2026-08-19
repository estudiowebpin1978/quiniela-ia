DROP FUNCTION IF EXISTS calculate_omega_v6_quantum(text, text, date);

CREATE OR REPLACE FUNCTION calculate_omega_v6_quantum(
  p_turno TEXT DEFAULT NULL,
  p_tier  TEXT DEFAULT 'free',
  p_date  DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ref_date DATE;
  v_turno_filter TEXT;
  v_result JSONB;
BEGIN
  IF p_date IS NULL THEN
    SELECT MAX(date) INTO v_ref_date FROM draws WHERE game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9';
  ELSE
    v_ref_date := p_date;
  END IF;
  v_turno_filter := p_turno;

  IF (
    SELECT COUNT(*) FROM draws
    WHERE game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
      AND date <= v_ref_date
      AND date >= v_ref_date - INTERVAL '90 days'
      AND (v_turno_filter IS NULL OR turno = v_turno_filter)
  ) < 10 THEN
    RETURN '{"2": [], "3": [], "4": [], "r": []}'::JSONB;
  END IF;

  WITH
  params AS (
    SELECT
      v_ref_date AS ref_date,
      v_turno_filter AS target_turno,
      150.0 AS tau,
      90 AS markov_window_days,
      0.20 AS markov_weight,
      0.30 AS hot_weight,
      0.20 AS cold_weight,
      0.10 AS penalty_weight,
      0.20 AS amplitude_factor
  ),
  raw_draws AS (
    SELECT
      d.id,
      d.date,
      d.turno,
      d.numbers,
      ROW_NUMBER() OVER (PARTITION BY d.turno ORDER BY d.date DESC, d.created_at DESC) AS rn_desc
    FROM draws d
    WHERE d.game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
      AND d.date <= (SELECT ref_date FROM params)
      AND ((SELECT target_turno FROM params) IS NULL OR d.turno = (SELECT target_turno FROM params))
  ),
  exploded AS (
    SELECT
      rd.id,
      rd.date,
      rd.turno,
      rd.rn_desc,
      pos - 1 AS position,
      val
    FROM raw_draws rd
    CROSS JOIN LATERAL (
      SELECT generate_subscripts(rd.numbers, 1) AS pos, unnest(rd.numbers) AS val
    ) u
  ),
  terminaciones AS (
    SELECT
      id,
      date,
      turno,
      position,
      val,
      LPAD(MOD(val, 100)::TEXT, 2, '0') AS t2,
      LPAD(MOD(val, 1000)::TEXT, 3, '0') AS t3,
      LPAD(val::TEXT, 4, '0') AS t4
    FROM exploded
  ),
  markov_pairs AS (
    SELECT
      t1.turno,
      t1.t2 AS prev_t2,
      t2.t2 AS curr_t2
    FROM terminaciones t1
    JOIN terminaciones t2
      ON t1.turno = t2.turno
     AND t1.date < t2.date
     AND t1.position = 0
     AND t2.position = 0
     AND t1.date >= (SELECT ref_date FROM params) - INTERVAL '90 days'
     AND t2.date <= (SELECT ref_date FROM params)
  ),
  markov_counts AS (
    SELECT
      turno,
      prev_t2,
      curr_t2,
      COUNT(*) AS trans_count
    FROM markov_pairs
    GROUP BY turno, prev_t2, curr_t2
  ),
  markov_prev_totals AS (
    SELECT
      turno,
      prev_t2,
      SUM(trans_count) AS total_from_prev
    FROM markov_counts
    GROUP BY turno, prev_t2
  ),
  markov_prob AS (
    SELECT
      mc.turno,
      mc.curr_t2 AS t2,
      (mc.trans_count + 1.0) / (mpt.total_from_prev + 100.0) AS prob,
      mc.prev_t2
    FROM markov_counts mc
    JOIN markov_prev_totals mpt
      ON mc.turno = mpt.turno
     AND mc.prev_t2 = mpt.prev_t2
  ),
  last_head AS (
    SELECT DISTINCT ON (turno)
      turno,
      t2 AS last_head_t2
    FROM terminaciones
    WHERE position = 0
      AND date <= (SELECT ref_date FROM params)
    ORDER BY turno, date DESC, rn_desc
  ),
  markov_score AS (
    SELECT
      c.t2,
      c.turno,
      COALESCE(mp.prob, 1.0/100.0) AS markov_prob
    FROM (
      SELECT DISTINCT t.t2, t.turno
      FROM terminaciones t
      WHERE t.date <= (SELECT ref_date FROM params)
    ) c
    LEFT JOIN markov_prob mp
      ON mp.t2 = c.t2
     AND mp.prev_t2 = (
       SELECT lh.last_head_t2 FROM last_head lh WHERE lh.turno = c.turno
     )
  ),
  temporal_weights AS (
    SELECT
      t2,
      turno,
      SUM(EXP(- ( (SELECT ref_date FROM params) - date )::NUMERIC / tau )) AS hot_score
    FROM terminaciones
    JOIN params ON true
    WHERE position = 0
      AND date <= (SELECT ref_date FROM params)
    GROUP BY t2, turno
  ),
  last_appearance AS (
    SELECT DISTINCT ON (t2, turno)
      t2,
      turno,
      date,
      ( (SELECT ref_date FROM params) - date ) AS days_since
    FROM terminaciones
    WHERE position = 0
      AND date <= (SELECT ref_date FROM params)
    ORDER BY t2, turno, date DESC
  ),
  cold_score AS (
    SELECT
      t2,
      turno,
      1.0 / (1.0 + days_since) AS cold_score
    FROM last_appearance
  ),
  entropy_penalty AS (
    SELECT
      t2,
      CASE
        WHEN t2[1] = t2[2] THEN 0.2
        WHEN t2 ~ '^[02468]{2}$' THEN 0.5
        WHEN t2 ~ '^[13579]{2}$' THEN 0.5
        WHEN t2 IN ('01','12','23','34','45','56','67','78','89') THEN 0.5
        WHEN t2 IN ('10','21','32','43','54','65','76','87','98') THEN 0.5
        ELSE 1.0
      END AS pattern_penalty
    FROM generate_series(0, 99) g(n)
    CROSS JOIN LATERAL (SELECT LPAD(n::TEXT, 2, '0') AS t2) t
  ),
  combined AS (
    SELECT
      c.t2,
      c.turno,
      COALESCE(ms.markov_prob, 1.0/100.0) AS markov_prob,
      COALESCE(tw.hot_score, 0) AS hot_score,
      COALESCE(cs.cold_score, 0) AS cold_score,
      ep.pattern_penalty
    FROM (
      SELECT DISTINCT t2, turno FROM terminaciones
      WHERE date <= (SELECT ref_date FROM params)
    ) c
    LEFT JOIN markov_score ms ON ms.t2 = c.t2 AND ms.turno = c.turno
    LEFT JOIN temporal_weights tw ON tw.t2 = c.t2 AND tw.turno = c.turno
    LEFT JOIN cold_score cs ON cs.t2 = c.t2 AND cs.turno = c.turno
    JOIN entropy_penalty ep ON ep.t2 = c.t2
  ),
  normalized AS (
    SELECT
      t2,
      turno,
      CASE WHEN max_markov > min_markov
           THEN (markov_prob - min_markov) / (max_markov - min_markov)
           ELSE 0.5 END AS markov_norm,
      CASE WHEN max_hot > min_hot
           THEN (hot_score - min_hot) / (max_hot - min_hot)
           ELSE 0.5 END AS hot_norm,
      CASE WHEN max_cold > min_cold
           THEN (cold_score - min_cold) / (max_cold - min_cold)
           ELSE 0.5 END AS cold_norm,
      pattern_penalty,
      (SELECT markov_weight FROM params) AS mw,
      (SELECT hot_weight FROM params) AS hw,
      (SELECT cold_weight FROM params) AS cw,
      (SELECT penalty_weight FROM params) AS pw
    FROM combined
    CROSS JOIN LATERAL (
      SELECT
        MIN(markov_prob) OVER () AS min_markov,
        MAX(markov_prob) OVER () AS max_markov,
        MIN(hot_score) OVER () AS min_hot,
        MAX(hot_score) OVER () AS max_hot,
        MIN(cold_score) OVER () AS min_cold,
        MAX(cold_score) OVER () AS max_cold
    ) stats
  ),
  scored AS (
    SELECT
      t2 AS terminacion,
      turno,
      (mw * markov_norm + hw * hot_norm + cw * cold_norm + pw * (1.0 - pattern_penalty)) AS base_score
    FROM normalized
  ),
  neighbors AS (
    SELECT
      s1.terminacion AS t2,
      s1.turno,
      s1.base_score,
      AVG(s2.base_score) AS neighbor_avg_score
    FROM scored s1
    LEFT JOIN scored s2
      ON s1.turno = s2.turno
     AND (s1.terminacion[1] = s2.terminacion[1] OR s1.terminacion[2] = s2.terminacion[2])
     AND s1.terminacion != s2.terminacion
    GROUP BY s1.terminacion, s1.turno, s1.base_score
  ),
  final_scored AS (
    SELECT
      t2 AS terminacion,
      turno,
      (base_score + (SELECT amplitude_factor FROM params) * COALESCE(neighbor_avg_score, 0)) AS final_score
    FROM neighbors
  ),
  ranked_2 AS (
    SELECT
      terminacion,
      final_score AS score,
      turno,
      ROW_NUMBER() OVER (PARTITION BY turno ORDER BY final_score DESC) AS rn
    FROM final_scored
  ),
  top_2 AS (
    SELECT
      terminacion,
      ROUND(score::NUMERIC, 4) AS score,
      turno
    FROM ranked_2
    WHERE rn <= 10
  ),
  ranked_3 AS (
    SELECT
      t3 AS terminacion,
      SUM(EXP(- ( (SELECT ref_date FROM params) - date )::NUMERIC / (SELECT tau FROM params) )) OVER (PARTITION BY t3, turno) AS hot_score,
      1.0 / (1.0 + COALESCE(MIN( (SELECT ref_date FROM params) - date ) OVER (PARTITION BY t3, turno), 999)) AS cold_score
    FROM terminaciones
    WHERE date <= (SELECT ref_date FROM params)
      AND position = 0
  ),
  top_3 AS (
    SELECT
      terminacion,
      ROUND((0.4 * hot_score + 0.6 * cold_score)::NUMERIC, 4) AS score,
      turno
    FROM (
      SELECT DISTINCT ON (terminacion, turno) terminacion, turno, hot_score, cold_score
      FROM ranked_3
      ORDER BY terminacion, turno, hot_score DESC
    ) sub
    WHERE hot_score > 0
    ORDER BY score DESC
    LIMIT 10
  ),
  ranked_4 AS (
    SELECT
      t4 AS terminacion,
      SUM(EXP(- ( (SELECT ref_date FROM params) - date )::NUMERIC / (SELECT tau FROM params) )) OVER (PARTITION BY t4, turno) AS hot_score,
      1.0 / (1.0 + COALESCE(MIN( (SELECT ref_date FROM params) - date ) OVER (PARTITION BY t4, turno), 999)) AS cold_score
    FROM terminaciones
    WHERE date <= (SELECT ref_date FROM params)
      AND position = 0
  ),
  top_4 AS (
    SELECT
      terminacion,
      ROUND((0.4 * hot_score + 0.6 * cold_score)::NUMERIC, 4) AS score,
      turno
    FROM (
      SELECT DISTINCT ON (terminacion, turno) terminacion, turno, hot_score, cold_score
      FROM ranked_4
      ORDER BY terminacion, turno, hot_score DESC
    ) sub
    WHERE hot_score > 0
    ORDER BY score DESC
    LIMIT 5
  ),
  pair_cooc AS (
    SELECT
      a.t2 AS cabeza,
      b.t2 AS acompanante,
      COUNT(DISTINCT a.date) AS cooc_count,
      a.turno
    FROM terminaciones a
    JOIN terminaciones b
      ON a.id = b.id
     AND a.position < b.position
     AND a.t2 < b.t2
    WHERE a.date <= (SELECT ref_date FROM params)
      AND a.position = 0
      AND b.position = 0
    GROUP BY a.t2, b.t2, a.turno
  ),
  top_pairs AS (
    SELECT
      cabeza || '-' || acompanante AS redoblona,
      turno,
      cooc_count AS score
    FROM pair_cooc
    WHERE cabeza IN (SELECT terminacion FROM top_2 WHERE rn <= 10)
      AND acompanante IN (SELECT terminacion FROM top_2 WHERE rn <= 10)
    ORDER BY cooc_count DESC
    LIMIT 5
  )
  SELECT jsonb_build_object(
    '2', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('terminacion', terminacion, 'score', score) ORDER BY score DESC)
      FROM top_2
      WHERE (p_tier = 'free' OR p_tier = 'premium')
    ), '[]'::JSONB),
    '3', CASE WHEN p_tier = 'premium' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('terminacion', terminacion, 'score', score) ORDER BY score DESC)
      FROM top_3
    ), '[]'::JSONB) ELSE '[]'::JSONB END,
    '4', CASE WHEN p_tier = 'premium' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('terminacion', terminacion, 'score', score) ORDER BY score DESC)
      FROM top_4
    ), '[]'::JSONB) ELSE '[]'::JSONB END,
    'r', CASE WHEN p_tier = 'premium' THEN COALESCE((
      SELECT jsonb_agg(jsonb_build_object('redoblona', redoblona, 'score', score) ORDER BY score DESC)
      FROM top_pairs
    ), '[]'::JSONB) ELSE '[]'::JSONB END
  ) INTO v_result;

  RETURN v_result;
END;
$$;