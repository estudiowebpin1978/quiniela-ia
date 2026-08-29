-- =============================================================
-- FASE 1: Base de Datos y Motor SQL — Quiniela IA
-- Execute in order via Supabase SQL Editor or Management API
-- =============================================================


-- =============================================================
-- SCRIPT 1: Normalización de estados
-- =============================================================

UPDATE user_predictions SET status = 'WON'     WHERE status = 'won';
UPDATE user_predictions SET status = 'LOST'    WHERE status = 'lost';
UPDATE user_predictions SET status = 'PENDING' WHERE status = 'pending';
UPDATE user_predictions SET status = 'PENDING' WHERE status IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_predictions_status_check'
  ) THEN
    ALTER TABLE user_predictions
      ADD CONSTRAINT user_predictions_status_check
      CHECK (status IN ('PENDING', 'WON', 'LOST'));
  END IF;
END $$;

ALTER TABLE user_predictions
  ALTER COLUMN status SET DEFAULT 'PENDING',
  ALTER COLUMN status SET NOT NULL;


-- =============================================================
-- SCRIPT 2: Trigger de Verificación Automática
-- CORREGIDO: Redoblona verification, deduplicated positions,
--            aciertos_redoblona in prediction_history
-- =============================================================

CREATE OR REPLACE FUNCTION verify_predictions_on_draw_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pred_record      RECORD;
  nums2            TEXT[];
  nums3            TEXT[];
  nums4            TEXT[];
  pred2_arr        TEXT[];
  pred3_arr        TEXT[];
  pred4_arr        TEXT[];
  pred_redoblona   TEXT;
  pred_cabeza      TEXT;
  pred_acompanante TEXT;
  aciertos2_json   JSONB := '[]'::JSONB;
  aciertos3_json   JSONB := '[]'::JSONB;
  aciertos4_json   JSONB := '[]'::JSONB;
  aciertos_red_json JSONB := '[]'::JSONB;
  total_hits       INT;
  pred_numeros     JSONB;
  i                INT;
  hit_rec          JSONB;
  unique_positions INT[] := '{}';
  pos              INT;
  red_cabeza_pos   INT;
  red_acomp_pos    INT;
BEGIN
  IF NEW.numbers IS NULL OR array_length(NEW.numbers, 1) < 5 THEN
    RETURN NEW;
  END IF;

  nums2 := ARRAY(SELECT LPAD(MOD(v, 100)::TEXT, 2, '0') FROM unnest(NEW.numbers) v);
  nums3 := ARRAY(SELECT LPAD(MOD(v, 1000)::TEXT, 3, '0') FROM unnest(NEW.numbers) v);
  nums4 := ARRAY(SELECT LPAD(v::TEXT, 4, '0') FROM unnest(NEW.numbers) v);

  FOR pred_record IN
    SELECT id, user_id, numeros
    FROM user_predictions
    WHERE date = NEW.date AND turno = NEW.turno AND status = 'PENDING'
  LOOP
    IF pred_record.numeros IS NULL OR array_length(pred_record.numeros, 1) = 0 THEN
      CONTINUE;
    END IF;

    IF array_length(pred_record.numeros, 1) = 1 AND pred_record.numeros[1] LIKE '{%' THEN
      BEGIN
        pred_numeros := pred_record.numeros[1]::JSONB;
      EXCEPTION WHEN OTHERS THEN
        pred_numeros := NULL;
      END;
    ELSIF array_length(pred_record.numeros, 1) > 1 THEN
      pred_numeros := to_jsonb(pred_record.numeros);
    ELSE
      pred_numeros := NULL;
    END IF;

    IF pred_numeros IS NULL THEN CONTINUE; END IF;

    IF jsonb_typeof(pred_numeros) = 'object' THEN
      pred2_arr := ARRAY(
        SELECT LPAD(v, 2, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'2', '[]'::JSONB)) v
      );
      pred3_arr := ARRAY(
        SELECT LPAD(v, 3, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'3', '[]'::JSONB)) v
      );
      pred4_arr := ARRAY(
        SELECT LPAD(v, 4, '0')
        FROM jsonb_array_elements_text(COALESCE(pred_numeros->'4', '[]'::JSONB)) v
      );
      pred_redoblona := pred_numeros->>'r';
    ELSE
      pred2_arr := ARRAY(SELECT LPAD(v, 2, '0') FROM jsonb_array_elements_text(pred_numeros) v);
      pred3_arr := '{}';
      pred4_arr := '{}';
      pred_redoblona := NULL;
    END IF;

    aciertos2_json := '[]'::JSONB;
    aciertos3_json := '[]'::JSONB;
    aciertos4_json := '[]'::JSONB;
    aciertos_red_json := '[]'::JSONB;
    unique_positions := '{}';

    FOR i IN 1..COALESCE(array_length(pred2_arr, 1), 0) LOOP
      pos := array_position(nums2, pred2_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred2_arr[i], 'puesto', pos);
        aciertos2_json := aciertos2_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    FOR i IN 1..COALESCE(array_length(pred3_arr, 1), 0) LOOP
      pos := array_position(nums3, pred3_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred3_arr[i], 'puesto', pos);
        aciertos3_json := aciertos3_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    FOR i IN 1..COALESCE(array_length(pred4_arr, 1), 0) LOOP
      pos := array_position(nums4, pred4_arr[i]);
      IF pos IS NOT NULL THEN
        hit_rec := jsonb_build_object('numero', pred4_arr[i], 'puesto', pos);
        aciertos4_json := aciertos4_json || hit_rec;
        IF NOT pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, pos);
        END IF;
      END IF;
    END LOOP;

    IF pred_redoblona IS NOT NULL AND pred_redoblona LIKE '%-%' THEN
      pred_cabeza      := split_part(pred_redoblona, '-', 1);
      pred_acompanante := split_part(pred_redoblona, '-', 2);
      red_cabeza_pos   := array_position(nums2, LPAD(pred_cabeza, 2, '0'));
      red_acomp_pos    := array_position(nums2, LPAD(pred_acompanante, 2, '0'));

      IF red_cabeza_pos IS NOT NULL AND red_acomp_pos IS NOT NULL THEN
        aciertos_red_json := jsonb_build_object(
          'cabeza', jsonb_build_object('numero', LPAD(pred_cabeza, 2, '0'), 'puesto', red_cabeza_pos),
          'acompanante', jsonb_build_object('numero', LPAD(pred_acompanante, 2, '0'), 'puesto', red_acomp_pos)
        );
        IF NOT red_cabeza_pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, red_cabeza_pos);
        END IF;
        IF NOT red_acomp_pos = ANY(unique_positions) THEN
          unique_positions := array_append(unique_positions, red_acomp_pos);
        END IF;
      END IF;
    END IF;

    total_hits := jsonb_array_length(aciertos2_json)
                + jsonb_array_length(aciertos3_json)
                + jsonb_array_length(aciertos4_json)
                + CASE WHEN jsonb_array_length(aciertos_red_json) > 0 THEN 1 ELSE 0 END;

    UPDATE user_predictions
    SET status = CASE WHEN total_hits > 0 THEN 'WON' ELSE 'LOST' END,
        aciertos = unique_positions,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = pred_record.id;

    INSERT INTO prediction_history (
      prediction_id, user_id, date, turno,
      numeros_2, numeros_3, numeros_4,
      resultado_oficial,
      aciertos_2, aciertos_3, aciertos_4,
      total_aciertos, verified, verified_at, game_id,
      redoblonas, aciertos_redoblona
    ) VALUES (
      pred_record.id, pred_record.user_id, NEW.date, NEW.turno,
      pred2_arr, pred3_arr, pred4_arr,
      NEW.numbers,
      aciertos2_json, aciertos3_json, aciertos4_json,
      total_hits, true, NOW(), NEW.game_id,
      CASE WHEN pred_redoblona IS NOT NULL
           THEN jsonb_build_object('cabeza', split_part(pred_redoblona, '-', 1), 'acompanante', split_part(pred_redoblona, '-', 2))
           ELSE '[]'::JSONB END,
      aciertos_red_json
    )
    ON CONFLICT (prediction_id) DO UPDATE SET
      aciertos_2 = EXCLUDED.aciertos_2,
      aciertos_3 = EXCLUDED.aciertos_3,
      aciertos_4 = EXCLUDED.aciertos_4,
      total_aciertos = EXCLUDED.total_aciertos,
      resultado_oficial = EXCLUDED.resultado_oficial,
      redoblonas = EXCLUDED.redoblonas,
      aciertos_redoblona = EXCLUDED.aciertos_redoblona,
      verified = true,
      verified_at = NOW();

    INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified)
    VALUES (
      pred_record.user_id, 1, total_hits,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      CASE WHEN total_hits > 0 THEN 1 ELSE 0 END,
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_predictions = user_stats.total_predictions + 1,
      total_hits = user_stats.total_hits + EXCLUDED.total_hits,
      current_streak = CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END,
      best_streak = GREATEST(user_stats.best_streak, CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END),
      last_verified = NOW();

  END LOOP;

  RETURN NEW;
END $$;


DROP TRIGGER IF EXISTS trg_verify_predictions ON draws;
CREATE TRIGGER trg_verify_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION verify_predictions_on_draw_insert();

-- Performance index for trigger query
CREATE INDEX IF NOT EXISTS idx_user_predictions_pending
  ON user_predictions (date, turno, status)
  WHERE status = 'PENDING';


-- =============================================================
-- SCRIPT 3: RPC calculate_omega_v5 — CORREGIDO
-- Tier filtering: free=2c only, premium=2c+3c+4c+redoblona
-- LANGUAGE sql, p_ prefixed params
-- =============================================================

DROP FUNCTION IF EXISTS calculate_omega_v5(text,text,date);

CREATE OR REPLACE FUNCTION calculate_omega_v5(
  p_turno TEXT,
  p_tier TEXT DEFAULT 'free',
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  prediccion_2cifras TEXT,
  prediccion_3cifras JSONB,
  prediccion_4cifras JSONB,
  redoblona JSONB
)
LANGUAGE sql
STABLE
AS $$
  WITH params AS (
    SELECT
      p_turno AS target_turno,
      p_date AS prediction_date,
      (SELECT COUNT(*) FROM draws WHERE turno = p_turno AND date < p_date) AS total_draws
  ),
  all_nums AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
           MOD(unnest(d.numbers), 100) AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  fr AS (SELECT val AS n, SUM(EXP(-0.02 * rn)) AS score FROM all_nums GROUP BY val),
  mx_fr AS (SELECT COALESCE(MAX(score),0.001) AS mx FROM fr),
  bay AS (
    SELECT val AS n, (COUNT(*)+1.0)/((SELECT total_draws FROM params)+100.0) AS posterior
    FROM all_nums GROUP BY val
  ),
  mx_bay AS (SELECT COALESCE(MAX(posterior),0.001) AS mx FROM bay),
  last_head AS (
    SELECT MOD(numbers[1],100) AS head
    FROM draws, params p
    WHERE turno=p.target_turno AND date < p.prediction_date
    ORDER BY date DESC, created_at DESC LIMIT 1
  ),
  mk_trans AS (
    SELECT MOD(unnest(numbers[1:20]),100) AS n
    FROM draws, params p
    WHERE turno=p.target_turno AND date < p.prediction_date
      AND MOD(numbers[1],100)=(SELECT head FROM last_head)
    ORDER BY date DESC LIMIT 200
  ),
  mk AS (SELECT n, COUNT(*) AS cnt FROM mk_trans WHERE n IS NOT NULL GROUP BY n),
  mx_mk AS (SELECT COALESCE(MAX(cnt),1) AS mx FROM mk),
  r20 AS (SELECT val AS n, COUNT(*) AS cnt FROM all_nums WHERE rn<=20 GROUP BY val),
  hist AS (SELECT val AS n, COUNT(*) AS cnt FROM all_nums GROUP BY val),
  hc AS (
    SELECT COALESCE(r.n,h.n) AS n,
      CASE WHEN h.cnt>0 THEN (COALESCE(r.cnt,0)::NUMERIC/20)/(h.cnt::NUMERIC/GREATEST((SELECT total_draws FROM params),1)) ELSE 0 END AS ratio
    FROM r20 r FULL OUTER JOIN hist h ON r.n=h.n
  ),
  mx_hc AS (SELECT COALESCE(MAX(ratio),0.001) AS mx FROM hc),
  ls AS (SELECT val AS n, MIN(rn) AS lr FROM all_nums GROUP BY val),
  gs AS (
    SELECT n, AVG(gap) AS mg FROM (
      SELECT val AS n, rn - LAG(rn) OVER (PARTITION BY val ORDER BY rn) AS gap FROM all_nums
    ) sub WHERE gap IS NOT NULL GROUP BY n
  ),
  ga AS (
    SELECT ls.n, CASE WHEN gs.mg>0 THEN ls.lr/gs.mg ELSE 0 END AS overdue_score
    FROM ls LEFT JOIN gs ON ls.n=gs.n
  ),
  mx_ga AS (SELECT COALESCE(MAX(overdue_score),0.001) AS mx FROM ga),
  t3 AS (SELECT val AS n FROM all_nums GROUP BY val ORDER BY COUNT(*) DESC LIMIT 3),
  co AS (
    SELECT a.val AS n, COUNT(*) AS cnt
    FROM all_nums a JOIN all_nums b ON a.rn=b.rn AND b.val IN (SELECT n FROM t3) AND a.val!=b.val
    GROUP BY a.val
  ),
  mx_co AS (SELECT COALESCE(MAX(cnt),1) AS mx FROM co),
  ps AS (
    SELECT MOD(d.numbers[1],100) AS n, 3 AS w FROM draws d, params p WHERE d.turno=p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[2],100) AS n, 2 FROM draws d, params p WHERE d.turno=p.target_turno AND d.date < p.prediction_date
    UNION ALL SELECT MOD(d.numbers[3],100) AS n, 1 FROM draws d, params p WHERE d.turno=p.target_turno AND d.date < p.prediction_date
  ),
  ps2 AS (SELECT n, SUM(w)::NUMERIC AS score FROM ps GROUP BY n),
  mx_ps AS (SELECT COALESCE(MAX(score),1) AS mx FROM ps2),
  sb AS (
    SELECT g.num AS n,
      CASE WHEN g.num BETWEEN 40 AND 60 THEN 1.0 WHEN g.num BETWEEN 30 AND 70 THEN 0.8 WHEN g.num BETWEEN 20 AND 80 THEN 0.5 ELSE 0.2 END AS score
    FROM generate_series(0,99) g(num)
  ),
  all_sc AS (
    SELECT g.num AS numero,
      COALESCE(fr.score/mx_fr.mx,0)*0.20 AS s1,
      COALESCE(bay.posterior/mx_bay.mx,0)*0.18 AS s2,
      COALESCE(mk.cnt::NUMERIC/mx_mk.mx,0)*0.15 AS s3,
      COALESCE(hc.ratio/mx_hc.mx,0)*0.15 AS s4,
      COALESCE(ga.overdue_score/mx_ga.mx,0)*0.12 AS s5,
      COALESCE(COALESCE(co.cnt,0)::NUMERIC/mx_co.mx,0)*0.10 AS s6,
      COALESCE(ps2.score/mx_ps.mx,0)*0.05 AS s7,
      COALESCE(sb.score,0)*0.05 AS s8
    FROM generate_series(0,99) g(num)
    LEFT JOIN fr ON g.num=fr.n LEFT JOIN bay ON g.num=bay.n LEFT JOIN mk ON g.num=mk.n
    LEFT JOIN hc ON g.num=hc.n LEFT JOIN ga ON g.num=ga.n LEFT JOIN co ON g.num=co.n
    LEFT JOIN ps2 ON g.num=ps2.n LEFT JOIN sb ON g.num=sb.n
    CROSS JOIN mx_fr CROSS JOIN mx_bay CROSS JOIN mx_mk CROSS JOIN mx_hc CROSS JOIN mx_ga CROSS JOIN mx_co CROSS JOIN mx_ps
  ),
  final_2c AS (
    SELECT numero, (s1+s2+s3+s4+s5+s6+s7+s8)::NUMERIC(7,4) AS puntaje_total FROM all_sc
  ),
  top_2c AS (
    SELECT fs.numero, fs.puntaje_total
    FROM final_2c fs WHERE fs.puntaje_total > 0
    ORDER BY fs.puntaje_total DESC LIMIT 10
  ),
  all_nums_3 AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
           LPAD(MOD(unnest(d.numbers), 1000)::TEXT, 3, '0') AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_3 AS (SELECT val AS n, COUNT(*) AS cnt, SUM(EXP(-0.03 * rn)) AS score FROM all_nums_3 GROUP BY val),
  top_3c AS (
    SELECT n AS numero FROM freq_3 WHERE cnt >= 2 ORDER BY score DESC LIMIT 10
  ),
  all_nums_4 AS (
    SELECT ROW_NUMBER() OVER (ORDER BY d.date DESC, d.created_at DESC) AS rn,
           LPAD(unnest(d.numbers)::TEXT, 4, '0') AS val
    FROM draws d, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  freq_4 AS (SELECT val AS n, COUNT(*) AS cnt, SUM(EXP(-0.04 * rn)) AS score FROM all_nums_4 GROUP BY val),
  top_4c AS (
    SELECT n AS numero FROM freq_4 WHERE cnt >= 2 ORDER BY score DESC LIMIT 10
  ),
  pair_data AS (
    SELECT DISTINCT d.date, LPAD(MOD(v, 100)::TEXT, 2, '0') AS ambo
    FROM draws d, unnest(d.numbers) v, params p
    WHERE d.turno = p.target_turno AND d.date < p.prediction_date
  ),
  top_2c_str AS (SELECT array_agg(LPAD(numero::TEXT, 2, '0') ORDER BY numero) AS arr FROM top_2c),
  pair_freq AS (
    SELECT a.ambo AS cabeza, b.ambo AS acompanante, COUNT(*) AS cnt
    FROM pair_data a
    JOIN pair_data b ON a.date = b.date AND a.ambo < b.ambo
    WHERE a.ambo IN (SELECT unnest(arr) FROM top_2c_str)
      AND b.ambo IN (SELECT unnest(arr) FROM top_2c_str)
    GROUP BY a.ambo, b.ambo
  ),
  best_pair AS (
    SELECT cabeza, acompanante FROM pair_freq ORDER BY cnt DESC LIMIT 1
  ),
  t2_arr AS (SELECT array_agg(numero ORDER BY puntaje_total DESC) AS arr FROM top_2c),
  t3_arr AS (SELECT array_agg(numero ORDER BY numero) AS arr FROM top_3c),
  t4_arr AS (SELECT array_agg(numero ORDER BY numero) AS arr FROM top_4c),
  first_row AS (
    SELECT
      (SELECT arr[1] FROM t2_arr) AS numero,
      (SELECT puntaje_total FROM top_2c ORDER BY puntaje_total DESC LIMIT 1) AS puntaje_total,
      (SELECT string_agg(LPAD(n::TEXT, 2, '0'), ',' ORDER BY n) FROM unnest((SELECT arr FROM t2_arr)) n) AS prediccion_2cifras,
      CASE WHEN p_tier = 'premium'
        THEN to_jsonb((SELECT arr FROM t3_arr))
        ELSE NULL::JSONB
      END AS prediccion_3cifras,
      CASE WHEN p_tier = 'premium'
        THEN to_jsonb((SELECT arr FROM t4_arr))
        ELSE NULL::JSONB
      END AS prediccion_4cifras,
      CASE WHEN p_tier = 'premium'
        THEN jsonb_build_object('cabeza', (SELECT cabeza FROM best_pair), 'acompanante', (SELECT acompanante FROM best_pair))
        ELSE NULL::JSONB
      END AS redoblona
  ),
  remaining_rows AS (
    SELECT
      arr[i] AS numero,
      0::NUMERIC AS puntaje_total,
      LPAD(arr[i]::TEXT, 2, '0') AS prediccion_2cifras,
      NULL::JSONB AS prediccion_3cifras,
      NULL::JSONB AS prediccion_4cifras,
      NULL::JSONB AS redoblona
    FROM t2_arr, generate_series(2, array_length(arr, 1)) i
    WHERE arr[i] IS NOT NULL
  )
  SELECT * FROM first_row WHERE numero IS NOT NULL
  UNION ALL
  SELECT * FROM remaining_rows;
$$;
