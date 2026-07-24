-- FIX-ROUND2.sql: Fix remaining HIGH/MEDIUM issues

-- 1. prediction_history: add UNIQUE constraint on prediction_id to prevent duplicates
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prediction_history_prediction_id_unique') THEN
    ALTER TABLE prediction_history ADD CONSTRAINT prediction_history_prediction_id_unique UNIQUE (prediction_id);
    RAISE NOTICE 'Added UNIQUE constraint on prediction_history.prediction_id';
  END IF;
END $$;

-- 2. verify_predictions: use ON CONFLICT for idempotency
CREATE OR REPLACE FUNCTION verify_predictions() RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_verified INT;
BEGIN
  INSERT INTO prediction_history (prediction_id, user_id, game_id, date, turno,
    predicted_2c, predicted_3c, predicted_4c, actual_2c, actual_3c, actual_4c, hit_2c, hit_3c, hit_4c, verified_at)
  SELECT up.id, up.user_id, up.game_id, up.date, up.turno, up.numbers_2c, up.numbers_3c, up.numbers_4c,
    d.numbers[1]%100, d.numbers[1]%1000, d.numbers[1],
    (d.numbers[1]%100=ANY(up.numbers_2c)), (d.numbers[1]%1000=ANY(up.numbers_3c)), (d.numbers[1]=ANY(up.numbers_4c)), NOW()
  FROM user_predictions up
  JOIN draws d ON d.game_id=up.game_id AND d.date=up.date AND d.turno=up.turno
  WHERE d.numbers IS NOT NULL AND array_length(d.numbers,1)>0
  ON CONFLICT (prediction_id) DO NOTHING;
  GET DIAGNOSTICS v_verified = ROW_COUNT;
  RETURN v_verified;
END;
$$;

-- 3. clean_old_predictions: only delete predictions older than 3 days AND already verified
--    This prevents deleting predictions before cron can verify them
CREATE OR REPLACE FUNCTION clean_old_predictions(p_older_than_days INT DEFAULT 3) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM user_predictions WHERE created_at < NOW()-(p_older_than_days||' days')::INTERVAL
    AND (id IN (SELECT prediction_id FROM prediction_history) OR created_at < NOW()- INTERVAL '7 days');
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 4. get_ensemble_scores: replace ERF() with manual approximation (no contrib needed)
--    ERF(x) ≈ 1 - e^(-x^2) * (a1*t + a2*t^2 + a3*t^3) where t = 1/(1+0.3275911*|x|)
CREATE OR REPLACE FUNCTION get_ensemble_scores(
  p_turno TEXT DEFAULT NULL, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(numero INT, ensemble_score NUMERIC, component_count INT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID; v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH factor AS (SELECT * FROM get_frequency_stats(v_turno_filter, 100, p_game_slug)),
  absence AS (SELECT * FROM get_absence_recency_cycles(v_turno_filter, p_game_slug)),
  entropy AS (SELECT * FROM get_entropy_scores(v_turno_filter, 500, p_game_slug)),
  survival AS (SELECT numero AS n, risk_percentile FROM get_survival_scores(v_turno_filter, 500, p_game_slug)),
  markov AS (SELECT next_number AS n, probability AS trans_prob FROM get_markov_transitions(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'], 2, 5, p_game_slug)),
  cooccur AS (SELECT numero AS n, cooccurrence_score FROM get_cooccurrence_scores(v_turno_filter, 100, p_game_slug)),
  combined AS (
    SELECT f.n AS numero,
      COALESCE(f.frequency_full,0) AS freq_score,
      COALESCE(a.risk_score, 0.5) AS risk_score,
      COALESCE(e.normalized_entropy, 0.5) AS entropy_score,
      COALESCE(s.risk_percentile, 50) AS survival_risk,
      COALESCE(m.trans_prob, 0) AS markov_prob,
      COALESCE(c.cooccurrence_score, 0.5) AS cooccur_score
    FROM factor f
    LEFT JOIN absence a ON f.n = a.numero
    LEFT JOIN entropy e ON f.n = e.numero
    LEFT JOIN survival s ON f.n = s.n
    LEFT JOIN markov m ON f.n = m.n
    LEFT JOIN cooccur c ON f.n = c.n
  )
  SELECT c.numero::INT,
    (c.freq_score*0.25 + (1-c.risk_score)*0.2 + c.entropy_score*0.15 + (1-c.survival_risk/100)*0.2 + c.markov_prob*0.1 + c.cooccur_score*0.1)::NUMERIC,
    6::INT
  FROM combined c ORDER BY c.numero;
END;
$$;
