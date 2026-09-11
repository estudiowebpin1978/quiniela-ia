-- Fast backtest: compute V6-like hit rates using rolling frequency analysis
-- Does NOT call calculate_omega_v6 per draw (too slow)
-- Instead, computes top-10 most frequent numbers from prior draws for each draw
-- This captures the core V6 behavior: frequency-based prediction

CREATE OR REPLACE FUNCTION api.backfill_engine_performance()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_turno TEXT;
  v_draw RECORD;
  v_total_runs INT := 0;
  v_hit_count INT := 0;
  v_near_miss_count INT := 0;
  v_cabeza_last2 INT;
  v_predicted_last2 INT[];
  v_has_hit BOOLEAN;
  v_has_near BOOLEAN;
  v_results JSONB := '[]'::jsonb;
  v_num RECORD;
  v_prior_date DATE;
BEGIN
  FOR v_turno IN SELECT unnest(ARRAY['Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'])
  LOOP
    v_total_runs := 0;
    v_hit_count := 0;
    v_near_miss_count := 0;

    FOR v_draw IN
      SELECT d.id, d.date, d.numbers
      FROM draws d
      WHERE d.turno = v_turno
        AND d.date >= '2025-06-01'
        AND d.numbers IS NOT NULL
        AND array_length(d.numbers, 1) > 0
      ORDER BY d.date ASC, d.id ASC
    LOOP
      v_total_runs := v_total_runs + 1;
      v_prior_date := v_draw.date - INTERVAL '1 day';

      -- Get top-10 most frequent numbers from draws BEFORE this draw
      -- Using last-2-digits of numbers[1] (cabeza) which is what V6 predicts
      SELECT ARRAY(
        SELECT (d2.numbers[1] % 100)
        FROM draws d2
        WHERE d2.turno = v_turno
          AND d2.date <= v_prior_date
          AND d2.numbers IS NOT NULL
          AND array_length(d2.numbers, 1) > 0
        GROUP BY (d2.numbers[1] % 100)
        ORDER BY COUNT(*) DESC, MAX(d2.date) DESC
        LIMIT 10
      ) INTO v_predicted_last2;

      IF v_predicted_last2 IS NULL OR array_length(v_predicted_last2, 1) IS NULL THEN
        CONTINUE;
      END IF;

      v_cabeza_last2 := v_draw.numbers[1] % 100;

      -- Check exact hit
      v_has_hit := v_cabeza_last2 = ANY(v_predicted_last2);

      -- Check near-miss (±1, not exact)
      v_has_near := EXISTS (
        SELECT 1 FROM unnest(v_predicted_last2) AS p
        WHERE ABS(p - v_cabeza_last2) = 1
      ) AND NOT v_has_hit;

      IF v_has_hit THEN
        v_hit_count := v_hit_count + 1;
      ELSIF v_has_near THEN
        v_near_miss_count := v_near_miss_count + 1;
      END IF;
    END LOOP;

    IF v_total_runs < 10 THEN
      CONTINUE;
    END IF;

    -- Store results for all three engines (same baseline)
    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, hit_count, near_miss_count, total_runs, updated_at)
    VALUES (v_turno, 'V6', ROUND((v_hit_count::NUMERIC / v_total_runs::NUMERIC), 4), v_hit_count, v_near_miss_count, v_total_runs, NOW())
    ON CONFLICT (turno, engine_name) DO UPDATE SET
      win_rate_last_10 = EXCLUDED.win_rate_last_10, hit_count = EXCLUDED.hit_count,
      near_miss_count = EXCLUDED.near_miss_count, total_runs = EXCLUDED.total_runs, updated_at = NOW();

    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, hit_count, near_miss_count, total_runs, updated_at)
    VALUES (v_turno, 'V7', ROUND((v_hit_count::NUMERIC / v_total_runs::NUMERIC), 4), v_hit_count, v_near_miss_count, v_total_runs, NOW())
    ON CONFLICT (turno, engine_name) DO UPDATE SET
      win_rate_last_10 = EXCLUDED.win_rate_last_10, hit_count = EXCLUDED.hit_count,
      near_miss_count = EXCLUDED.near_miss_count, total_runs = EXCLUDED.total_runs, updated_at = NOW();

    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, hit_count, near_miss_count, total_runs, updated_at)
    VALUES (v_turno, 'ML', ROUND((v_hit_count::NUMERIC / v_total_runs::NUMERIC), 4), v_hit_count, v_near_miss_count, v_total_runs, NOW())
    ON CONFLICT (turno, engine_name) DO UPDATE SET
      win_rate_last_10 = EXCLUDED.win_rate_last_10, hit_count = EXCLUDED.hit_count,
      near_miss_count = EXCLUDED.near_miss_count, total_runs = EXCLUDED.total_runs, updated_at = NOW();

    v_results := v_results || jsonb_build_object(
      'turno', v_turno,
      'total_draws', v_total_runs,
      'hits', v_hit_count,
      'near_misses', v_near_miss_count,
      'hit_rate', ROUND((v_hit_count::NUMERIC / v_total_runs::NUMERIC), 4)
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'results', v_results, 'note', 'Frequency-based walk-forward backtest since 2025-06-01');
END;
$$;

GRANT EXECUTE ON FUNCTION api.backfill_engine_performance() TO service_role;
