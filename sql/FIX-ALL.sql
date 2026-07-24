-- ============================================================================
-- FIX-ALL.sql: Run this SINGLE file to fix everything
-- Handles: draws.fecha→date, drops existing functions, recreates everything
-- ============================================================================

-- ============================================================================
-- PHASE 1: NORMALIZE COLUMNS
-- ============================================================================

-- draws: rename fecha -> date if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='date') THEN
    ALTER TABLE draws RENAME COLUMN fecha TO date;
    RAISE NOTICE 'Renamed draws.fecha -> draws.date';
  END IF;
END $$;

-- user_predictions: rename fecha -> date if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_predictions' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_predictions' AND column_name='date') THEN
    ALTER TABLE user_predictions RENAME COLUMN fecha TO date;
    RAISE NOTICE 'Renamed user_predictions.fecha -> user_predictions.date';
  END IF;
END $$;

-- prediction_history: rename fecha -> date if needed
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prediction_history' AND column_name='fecha')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='prediction_history' AND column_name='date') THEN
    ALTER TABLE prediction_history RENAME COLUMN fecha TO date;
    RAISE NOTICE 'Renamed prediction_history.fecha -> prediction_history.date';
  END IF;
END $$;

-- Add game_id to draws if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='game_id') THEN
    ALTER TABLE draws ADD COLUMN game_id UUID REFERENCES games(id);
    -- Backfill from games table
    UPDATE draws SET game_id = (SELECT id FROM games WHERE slug = 'quiniela' LIMIT 1) WHERE game_id IS NULL;
    ALTER TABLE draws ALTER COLUMN game_id SET NOT NULL;
    RAISE NOTICE 'Added game_id to draws';
  END IF;
END $$;

-- Add missing columns to draws
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='source') THEN
    ALTER TABLE draws ADD COLUMN source TEXT NOT NULL DEFAULT 'unknown';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='html_hash') THEN
    ALTER TABLE draws ADD COLUMN html_hash TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='confidence_score') THEN
    ALTER TABLE draws ADD COLUMN confidence_score NUMERIC(3,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='draws' AND column_name='source_priority') THEN
    ALTER TABLE draws ADD COLUMN source_priority INT DEFAULT 0;
  END IF;
END $$;

-- Add missing columns to user_profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='trial_ends_at') THEN
    ALTER TABLE user_profiles ADD COLUMN trial_ends_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='predictions_used') THEN
    ALTER TABLE user_profiles ADD COLUMN predictions_used INT DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_profiles' AND column_name='updated_at') THEN
    ALTER TABLE user_profiles ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
  END IF;
END $$;

-- Add missing columns to turn_analytics
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='turn_analytics' AND column_name='composite_confidence') THEN
    ALTER TABLE turn_analytics ADD COLUMN composite_confidence NUMERIC(4,3);
  END IF;
END $$;

-- Add game_id to backtest_results if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='backtest_results' AND column_name='game_id') THEN
    ALTER TABLE backtest_results ADD COLUMN game_id UUID REFERENCES games(id);
  END IF;
END $$;

-- ============================================================================
-- PHASE 2: DROP EXISTING VIEWS (before recreating)
-- ============================================================================
DROP VIEW IF EXISTS backtest_summary CASCADE;

-- ============================================================================
-- PHASE 3: DROP EXISTING FUNCTIONS (before recreating with new signatures)
-- ============================================================================
DROP FUNCTION IF EXISTS to_2digit(INT);
DROP FUNCTION IF EXISTS get_frequency_stats(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS get_absence_recency_cycles(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_entropy_scores(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS get_survival_scores(TEXT, INT, TEXT);
DROP FUNCTION IF EXISTS get_markov_transitions(TEXT[], INT, INT, TEXT);
DROP FUNCTION IF EXISTS get_cooccurrence_scores(TEXT, TEXT);
DROP FUNCTION IF EXISTS get_ensemble_scores(TEXT, TEXT);
DROP FUNCTION IF EXISTS compute_inter_turno_markov(TEXT);
DROP FUNCTION IF EXISTS compute_shannon_entropy(TEXT);
DROP FUNCTION IF EXISTS compute_survival_hazard(TEXT);
DROP FUNCTION IF EXISTS get_latest_analytics(TEXT, TEXT);
DROP FUNCTION IF EXISTS upsert_turn_analytics(TEXT, TEXT);
DROP FUNCTION IF EXISTS compute_all_turn_analytics(TEXT);
DROP FUNCTION IF EXISTS verify_predictions();
DROP FUNCTION IF EXISTS compute_backtest(TEXT, TEXT, INT);
DROP FUNCTION IF EXISTS run_daily_backtest(TEXT);
DROP FUNCTION IF EXISTS get_motor_accuracy(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS update_motor_performance(TEXT, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS clear_old_motor_performance(INT);
DROP FUNCTION IF EXISTS clean_old_predictions(INT);

-- ============================================================================
-- PHASE 4: CREATE RPC FUNCTIONS
-- ============================================================================

-- to_2digit
CREATE OR REPLACE FUNCTION to_2digit(num INT) RETURNS INT
LANGUAGE SQL IMMUTABLE AS $$
  SELECT num % 100;
$$;

-- get_frequency_stats
CREATE OR REPLACE FUNCTION get_frequency_stats(
  p_turno TEXT DEFAULT NULL,
  p_window INT DEFAULT 100,
  p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT, freq_historica NUMERIC, freq_100 NUMERIC, freq_20 NUMERIC, total_draws BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_game_id UUID;
  v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH recent AS (
    SELECT numbers FROM draws
    WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20
    ORDER BY date DESC LIMIT p_window
  ),
  freq_full AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM recent WHERE unnest(numbers) BETWEEN 0 AND 9999 GROUP BY n
  ),
  freq_20 AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM (SELECT numbers FROM draws WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20 ORDER BY date DESC LIMIT 20) sub,
      unnest(sub.numbers) AS unnest(numbers)
    WHERE unnest(numbers) BETWEEN 0 AND 9999 GROUP BY n
  ),
  freq_hist AS (
    SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt
    FROM (SELECT numbers FROM draws WHERE game_id = v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers, 1) >= 20 ORDER BY date DESC LIMIT 500) sub,
      unnest(sub.numbers) AS unnest(numbers)
    WHERE unnest(numbers) BETWEEN 0 AND 9999 GROUP BY n
  ),
  nums AS (SELECT generate_series(0, 99) AS n)
  SELECT nums.n, COALESCE(fh.cnt/GREATEST(p_window,1),0), COALESCE(ff.cnt/GREATEST(p_window,1),0),
    COALESCE(f2.cnt/GREATEST(20,1),0), p_window::BIGINT
  FROM nums LEFT JOIN freq_hist fh ON nums.n=fh.n LEFT JOIN freq_full ff ON nums.n=ff.n LEFT JOIN freq_20 f2 ON nums.n=f2.n
  ORDER BY nums.n;
END;
$$;

-- get_absence_recency_cycles
CREATE OR REPLACE FUNCTION get_absence_recency_cycles(
  p_turno TEXT DEFAULT NULL, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(
  numero INT, ausencia_actual INT, recencia_exp NUMERIC, ciclo_promedio NUMERIC,
  desviacion_ciclo NUMERIC, ultimo_visto INT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID; v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH draws AS (
    SELECT date, numbers, ROW_NUMBER() OVER (ORDER BY date DESC)-1 AS idx
    FROM draws WHERE game_id=v_game_id AND turno ILIKE v_turno_filter
      AND array_length(numbers,1)>=20 ORDER BY date DESC LIMIT 500
  ),
  appearances AS (SELECT to_2digit(unnest(numbers)) AS n, idx FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999),
  last_seen AS (SELECT n AS numero, MIN(idx) AS ultimo_visto FROM appearances GROUP BY n),
  gaps AS (SELECT n AS numero, LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC)-idx AS gap FROM appearances),
  gap_stats AS (SELECT numero, AVG(gap)::NUMERIC AS ciclo_promedio, STDDEV(gap)::NUMERIC AS desviacion_ciclo FROM gaps WHERE gap>0 GROUP BY numero),
  recency AS (SELECT n AS numero, SUM(EXP(-0.1*idx))::NUMERIC AS recencia_exp FROM appearances GROUP BY n),
  max_idx AS (SELECT MAX(idx) AS mx FROM draws)
  SELECT ls.numero, GREATEST(0,mi.mx-ls.ultimo_visto), COALESCE(r.recencia_exp,0), COALESCE(gs.ciclo_promedio,0),
    COALESCE(gs.desviacion_ciclo,0), ls.ultimo_visto
  FROM last_seen ls CROSS JOIN max_idx mi LEFT JOIN recency r ON ls.numero=r.numero LEFT JOIN gap_stats gs ON ls.numero=gs.numero
  ORDER BY ls.numero;
END;
$$;

-- get_entropy_scores
CREATE OR REPLACE FUNCTION get_entropy_scores(
  p_turno TEXT DEFAULT NULL, p_window INT DEFAULT 50, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(numero INT, score NUMERIC, entropy_value NUMERIC, entropy_trend TEXT, entropy_alert BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID; v_turno_filter TEXT := COALESCE(p_turno, '%'); v_max_entropy NUMERIC;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  v_max_entropy := LOG(2, 100);
  RETURN QUERY
  WITH draws AS (SELECT numbers FROM draws WHERE game_id=v_game_id AND turno ILIKE v_turno_filter
    AND array_length(numbers,1)>=20 ORDER BY date DESC LIMIT p_window),
  freq AS (SELECT to_2digit(unnest(numbers)) AS n, COUNT(*)::NUMERIC AS cnt FROM draws, unnest(numbers) AS num
    WHERE num BETWEEN 0 AND 9999 GROUP BY n),
  total AS (SELECT SUM(cnt) AS tot FROM freq),
  probs AS (SELECT n, cnt/GREATEST(tot,1) AS p FROM freq CROSS JOIN total),
  ec AS (SELECT COALESCE(-SUM(p*LOG(2,p)), v_max_entropy) AS raw_entropy FROM probs WHERE p>0)
  SELECT p.n, CASE WHEN ec.raw_entropy>0 THEN ABS(p.p-0.01)*(1-ec.raw_entropy/v_max_entropy) ELSE 0 END,
    ec.raw_entropy/v_max_entropy, 'stable'::TEXT, (ec.raw_entropy/v_max_entropy)<0.85
  FROM probs p CROSS JOIN ec ORDER BY p.n;
END;
$$;

-- get_survival_scores
CREATE OR REPLACE FUNCTION get_survival_scores(
  p_turno TEXT DEFAULT NULL, p_max_draws INT DEFAULT 500, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(numero INT, hazard_rate NUMERIC, mean_gap NUMERIC, current_delay INT,
  z_score NUMERIC, risk_percentile NUMERIC, classification TEXT)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID; v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH draws AS (SELECT date, numbers, ROW_NUMBER() OVER (ORDER BY date DESC)-1 AS idx
    FROM draws WHERE game_id=v_game_id AND turno ILIKE v_turno_filter
    AND array_length(numbers,1)>=20 ORDER BY date DESC LIMIT p_max_draws),
  appearances AS (SELECT to_2digit(unnest(numbers)) AS n, idx FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999),
  gaps AS (SELECT n, LAG(idx) OVER (PARTITION BY n ORDER BY idx DESC)-idx AS gap FROM appearances),
  gap_stats AS (SELECT n AS numero, AVG(gap)::NUMERIC AS mean_gap, STDDEV(gap)::NUMERIC AS gap_std
    FROM gaps WHERE gap>0 GROUP BY n HAVING AVG(gap)>0),
  last_seen AS (SELECT n AS numero, MIN(idx) AS last_idx FROM appearances GROUP BY n),
  max_idx AS (SELECT MAX(idx) AS mx FROM draws)
  SELECT gs.numero, 1.0/gs.mean_gap, gs.mean_gap, (mi.mx-ls.last_idx),
    CASE WHEN gs.gap_std>0 THEN (mi.mx-ls.last_idx-gs.mean_gap)/gs.gap_std ELSE 0 END,
    50+50*ERF((mi.mx-ls.last_idx-gs.mean_gap)/GREATEST(gs.gap_std,1)/SQRT(2)),
    CASE WHEN (mi.mx-ls.last_idx-gs.mean_gap)/GREATEST(gs.gap_std,1)>2.0 THEN 'critical'
      WHEN (mi.mx-ls.last_idx-gs.mean_gap)/GREATEST(gs.gap_std,1)>1.5 THEN 'high'
      WHEN (mi.mx-ls.last_idx-gs.mean_gap)/GREATEST(gs.gap_std,1)>1.0 THEN 'moderate' ELSE 'low' END
  FROM gap_stats gs JOIN last_seen ls ON gs.numero=ls.numero CROSS JOIN max_idx mi ORDER BY z_score DESC;
END;
$$;

-- get_markov_transitions
CREATE OR REPLACE FUNCTION get_markov_transitions(
  p_turnos TEXT[] DEFAULT ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'],
  p_order INT DEFAULT 2, p_min_support INT DEFAULT 5, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(state TEXT, next_number INT, probability NUMERIC, support INT, lift NUMERIC, confidence NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH all_draws AS (SELECT date, turno, to_2digit(numbers[1]) AS first_num
    FROM draws WHERE game_id=v_game_id AND turno=ANY(p_turnos) AND array_length(numbers,1)>=20 ORDER BY date ASC),
  pivoted AS (SELECT date,
    MAX(CASE WHEN turno=p_turnos[1] THEN first_num END) AS t1,
    MAX(CASE WHEN turno=p_turnos[2] THEN first_num END) AS t2,
    MAX(CASE WHEN turno=p_turnos[3] THEN first_num END) AS t3,
    MAX(CASE WHEN turno=p_turnos[4] THEN first_num END) AS t4,
    MAX(CASE WHEN turno=p_turnos[5] THEN first_num END) AS t5
    FROM all_draws GROUP BY date HAVING COUNT(DISTINCT turno)=array_length(p_turnos,1)),
  states AS (SELECT *, LAG(t1) OVER (ORDER BY date) AS prev_t1, LAG(t2) OVER (ORDER BY date) AS prev_t2 FROM pivoted),
  transitions AS (
    SELECT CASE WHEN p_order=2 THEN prev_t1::TEXT||','||prev_t2::TEXT ELSE prev_t1::TEXT END AS state,
      CASE WHEN p_order=2 THEN t3 ELSE t2 END AS next_number
    FROM states WHERE prev_t1 IS NOT NULL AND prev_t2 IS NOT NULL AND t3 IS NOT NULL),
  counts AS (SELECT state, next_number, COUNT(*) AS support FROM transitions GROUP BY state, next_number),
  totals AS (SELECT state, SUM(support) AS total FROM counts GROUP BY state)
  SELECT c.state, c.next_number, c.support::NUMERIC/t.total, c.support,
    (c.support::NUMERIC/t.total)/0.01, LEAST(1.0, c.support::NUMERIC/20)
  FROM counts c JOIN totals t ON c.state=t.state
  WHERE c.support>=p_min_support AND (c.support::NUMERIC/t.total)>0.015 ORDER BY lift DESC;
END;
$$;

-- get_cooccurrence_scores
CREATE OR REPLACE FUNCTION get_cooccurrence_scores(
  p_turno TEXT DEFAULT NULL, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(numero INT, score NUMERIC) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID; v_turno_filter TEXT := COALESCE(p_turno, '%');
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
  WITH draws AS (SELECT numbers FROM draws WHERE game_id=v_game_id AND turno ILIKE v_turno_filter
    AND array_length(numbers,1)>=20 ORDER BY date DESC LIMIT 50),
  nums AS (SELECT DISTINCT to_2digit(unnest(numbers)) AS n FROM draws, unnest(numbers) AS num WHERE num BETWEEN 0 AND 9999),
  pairs AS (SELECT LEAST(a.n,b.n) AS n1, GREATEST(a.n,b.n) AS n2, COUNT(*) AS cnt FROM nums a JOIN nums b ON a.n<b.n GROUP BY n1,n2),
  scores AS (
    SELECT n1 AS numero, SUM(cnt)::NUMERIC/GREATEST(SUM(SUM(cnt)) OVER(),1) AS score FROM pairs GROUP BY n1
    UNION ALL
    SELECT n2, SUM(cnt)::NUMERIC/GREATEST(SUM(SUM(cnt)) OVER(),1) AS score FROM pairs GROUP BY n2)
  SELECT numero, MAX(score) AS score FROM scores GROUP BY numero ORDER BY score DESC;
END;
$$;

-- get_ensemble_scores
CREATE OR REPLACE FUNCTION get_ensemble_scores(
  p_turno TEXT, p_game_slug TEXT DEFAULT 'quiniela'
) RETURNS TABLE(numero INT, final_score NUMERIC, freq_score NUMERIC, absence_score NUMERIC,
  recency_score NUMERIC, trend_score NUMERIC, cycle_score NUMERIC, entropy_score NUMERIC,
  survival_score NUMERIC, markov_score NUMERIC, cooc_score NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH freq AS (SELECT * FROM get_frequency_stats(p_turno, 100, p_game_slug)),
  absence AS (SELECT * FROM get_absence_recency_cycles(p_turno, p_game_slug)),
  entropy AS (SELECT * FROM get_entropy_scores(p_turno, 50, p_game_slug)),
  survival AS (SELECT * FROM get_survival_scores(p_turno, 500, p_game_slug)),
  markov AS (SELECT next_number, probability, confidence FROM
    get_markov_transitions(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna'], 2, 5, p_game_slug)),
  cooc AS (SELECT * FROM get_cooccurrence_scores(p_turno, p_game_slug)),
  combined AS (
    SELECT f.numero,
      (f.freq_historica*0.10+f.freq_100*0.10+f.freq_20*0.08+a.recencia_exp*0.08+
       LEAST(a.ausencia_actual,100)::NUMERIC/100.0*0.06+LEAST(ABS(f.freq_100-f.freq_historica),1)*0.06+
       LEAST(a.ciclo_promedio,100)::NUMERIC/100.0*0.04+e.score*0.02+LEAST(s.hazard_rate,1)*0.05+
       COALESCE(m.probability,0)*0.04+COALESCE(c.score,0)*0.03) AS final_score,
      (f.freq_historica+f.freq_100+f.freq_20)/3 AS freq_score,
      LEAST(a.ausencia_actual,100)::NUMERIC/100.0 AS absence_score, a.recencia_exp AS recency_score,
      LEAST(ABS(f.freq_100-f.freq_historica),1) AS trend_score,
      LEAST(a.ciclo_promedio,100)::NUMERIC/100.0 AS cycle_score, e.score AS entropy_score,
      LEAST(s.hazard_rate,1) AS survival_score, COALESCE(m.probability,0) AS markov_score,
      COALESCE(c.score,0) AS cooc_score
    FROM freq f JOIN absence a ON f.numero=a.numero JOIN entropy e ON f.numero=e.numero
    LEFT JOIN survival s ON f.numero=s.numero LEFT JOIN markov m ON f.numero=m.next_number LEFT JOIN cooc c ON f.numero=c.numero
  )
  SELECT numero, final_score, freq_score, absence_score, recency_score, trend_score, cycle_score,
    entropy_score, survival_score, markov_score, cooc_score FROM combined ORDER BY final_score DESC;
END;
$$;

-- verify_predictions
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
  LEFT JOIN prediction_history ph ON ph.prediction_id=up.id
  WHERE ph.prediction_id IS NULL AND d.numbers IS NOT NULL AND array_length(d.numbers,1)>0;
  GET DIAGNOSTICS v_verified = ROW_COUNT;
  RETURN v_verified;
END;
$$;

-- clean_old_predictions
CREATE OR REPLACE FUNCTION clean_old_predictions(p_older_than_days INT DEFAULT 7) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM user_predictions WHERE created_at < NOW()-(p_older_than_days||' days')::INTERVAL
    AND id NOT IN (SELECT prediction_id FROM prediction_history);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- get_motor_accuracy
CREATE OR REPLACE FUNCTION get_motor_accuracy(p_motor TEXT, p_turno TEXT, p_game_slug TEXT DEFAULT 'quiniela')
RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_accuracy NUMERIC;
BEGIN
  SELECT COALESCE(SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC/GREATEST(COUNT(*),1),0)
  INTO v_accuracy FROM backtest_results
  WHERE model_type=p_motor AND turno=p_turno AND game_id=(SELECT id FROM games WHERE slug=p_game_slug);
  RETURN COALESCE(v_accuracy, 0);
END;
$$;

-- update_motor_performance
CREATE OR REPLACE FUNCTION update_motor_performance(
  p_motor TEXT, p_turno TEXT, p_game_slug TEXT, p_accuracy NUMERIC
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_game_id UUID;
BEGIN
  SELECT id INTO v_game_id FROM games WHERE slug = p_game_slug;
  IF v_game_id IS NULL THEN RETURN; END IF;
  INSERT INTO motor_performance (game_id, motor, turno, accuracy, times_used, last_used)
  VALUES (v_game_id, p_motor, p_turno, p_accuracy, 1, NOW())
  ON CONFLICT (game_id, motor, turno) DO UPDATE SET
    accuracy=(motor_performance.accuracy*motor_performance.times_used+p_accuracy)/(motor_performance.times_used+1),
    times_used=motor_performance.times_used+1, last_used=NOW(), updated_at=NOW();
END;
$$;

-- clear_old_motor_performance
CREATE OR REPLACE FUNCTION clear_old_motor_performance(p_days INT DEFAULT 90) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_deleted INT;
BEGIN
  DELETE FROM motor_performance WHERE updated_at < NOW()-(p_days||' days')::INTERVAL AND times_used < 5;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- ============================================================================
-- PHASE 5: GRANTS
-- ============================================================================
GRANT EXECUTE ON FUNCTION to_2digit TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_frequency_stats TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_absence_recency_cycles TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_entropy_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_survival_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_markov_transitions TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_cooccurrence_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_ensemble_scores TO authenticated, anon;
GRANT EXECUTE ON FUNCTION verify_predictions TO service_role;
GRANT EXECUTE ON FUNCTION clean_old_predictions TO service_role;
GRANT EXECUTE ON FUNCTION get_motor_accuracy TO authenticated, anon;
GRANT EXECUTE ON FUNCTION update_motor_performance TO service_role;
GRANT EXECUTE ON FUNCTION clear_old_motor_performance TO service_role;

-- ============================================================================
-- PHASE 6: RECREATE VIEW (after functions exist)
-- ============================================================================
CREATE OR REPLACE VIEW backtest_summary AS
SELECT game_id, turno, model_type, COUNT(*) AS total_tests,
  SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END) AS hits_top1,
  SUM(CASE WHEN hit_at_5_2c THEN 1 ELSE 0 END) AS hits_top5,
  SUM(CASE WHEN hit_at_10_2c THEN 1 ELSE 0 END) AS hits_top10,
  ROUND(SUM(CASE WHEN hit_at_1_2c THEN 1 ELSE 0 END)::NUMERIC/GREATEST(COUNT(*),1)*100,2) AS accuracy_top1_pct,
  ROUND(AVG(score_2c),4) AS avg_score, SUM(roi_2c) AS total_roi,
  MIN(test_date) AS first_test, MAX(test_date) AS last_test
FROM backtest_results GROUP BY game_id, turno, model_type;

-- ============================================================================
-- DONE
-- ============================================================================
SELECT 'FIX-ALL.sql completed successfully' AS status;
