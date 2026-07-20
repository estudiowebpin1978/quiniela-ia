-- ============================================================
-- TURN ANALYTICS: Pre-calculated statistical tables
-- Run after multi-game-schema.sql
-- ============================================================

-- === 1. turn_analytics table ===
CREATE TABLE IF NOT EXISTS turn_analytics (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL,
  game_id UUID,
  fecha DATE DEFAULT CURRENT_DATE,
  fecha_calculo TIMESTAMPTZ DEFAULT NOW(),
  
  -- Inter-Turno Markov (order 2 conditional probabilities)
  markov_transitions JSONB DEFAULT '{}'::jsonb,
  
  -- Shannon Entropy
  entropy_value NUMERIC(8,6),
  entropy_trend TEXT, -- 'ascending', 'descending', 'stable'
  entropy_alert BOOLEAN DEFAULT FALSE,
  
  -- Survival Analysis (hazard rates per number)
  survival_hazard JSONB DEFAULT '{}'::jsonb,
  survival_critical_numbers JSONB DEFAULT '[]'::jsonb,
  
  -- Genetic Algorithm optimized weights
  genetic_weights JSONB DEFAULT '{}'::jsonb,
  genetic_fitness NUMERIC(8,4),
  
  -- Composite confidence
  composite_confidence NUMERIC(5,4),
  
  UNIQUE(turno, fecha)
);

ALTER TABLE turn_analytics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only turn_analytics" ON turn_analytics;
CREATE POLICY "Service role only turn_analytics" ON turn_analytics FOR ALL USING (auth.role() = 'service_role');
-- Public read for pre-calculated analytics
DROP POLICY IF EXISTS "Public read turn_analytics" ON turn_analytics;
CREATE POLICY "Public read turn_analytics" ON turn_analytics FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno ON turn_analytics(turno);
CREATE INDEX IF NOT EXISTS idx_turn_analytics_turno_fecha ON turn_analytics(turno, fecha DESC);

-- === 2. RPC: Compute inter-turno Markov transition matrix ===
CREATE OR REPLACE FUNCTION compute_inter_turno_markov(
  p_turno TEXT,
  p_order INTEGER DEFAULT 2,
  p_limit INTEGER DEFAULT 500
) RETURNS JSONB AS $$
DECLARE
  v_draws RECORD;
  v_transitions JSONB := '{}'::jsonb;
  v_state TEXT;
  v_next INTEGER;
  v_state_counts JSONB;
  v_total INTEGER;
BEGIN
  -- Build transitions from draw sequence
  FOR v_draws IN
    SELECT date, numbers[1] % 100 as first_num
    FROM draws
    WHERE turno ILIKE '%' || p_turno || '%'
    ORDER BY date DESC
    LIMIT p_limit
  LOOP
    IF v_next IS NOT NULL THEN
      v_state := v_draws.first_num::TEXT;
      IF v_transitions->v_state IS NULL THEN
        v_transitions := jsonb_set(v_transitions, ARRAY[v_state], '0'::jsonb);
      END IF;
      v_transitions := jsonb_set(
        v_transitions, 
        ARRAY[v_state],
        ((v_transitions->>v_state)::INTEGER + 1)::TEXT::jsonb
      );
    END IF;
    v_next := v_draws.first_num;
  END LOOP;

  -- Normalize to probabilities
  FOR v_state IN SELECT jsonb_object_keys(v_transitions)
  LOOP
    v_total := (v_transitions->>v_state)::INTEGER;
    IF v_total > 0 THEN
      v_transitions := jsonb_set(
        v_transitions,
        ARRAY[v_state],
        ROUND((v_total::NUMERIC / p_limit), 6)::TEXT::jsonb
      );
    END IF;
  END LOOP;

  RETURN v_transitions;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === 3. RPC: Compute Shannon Entropy for recent draws ===
CREATE OR REPLACE FUNCTION compute_shannon_entropy(
  p_turno TEXT,
  p_window INTEGER DEFAULT 50
) RETURNS TABLE (
  entropy NUMERIC,
  trend TEXT,
  alert BOOLEAN,
  distribution JSONB
) AS $$
DECLARE
  v_draws RECORD;
  v_freq NUMERIC[] := ARRAY_FILL(0, ARRAY[100]);
  v_total INTEGER := 0;
  v_entropy NUMERIC := 0;
  v_p NUMERIC;
  v_recent_entropy NUMERIC;
  v_old_entropy NUMERIC;
  v_trend TEXT;
  v_alert BOOLEAN;
  v_dist JSONB;
BEGIN
  -- Build frequency distribution from recent draws
  FOR v_draws IN
    SELECT numbers
    FROM draws
    WHERE turno ILIKE '%' || p_turno || '%'
    ORDER BY date DESC
    LIMIT p_window
  LOOP
    FOR i IN 1..array_length(v_draws.numbers, 1)
    LOOP
      DECLARE v_num INTEGER := v_draws.numbers[i] % 100;
      BEGIN
        v_freq[v_num + 1] := v_freq[v_num + 1] + 1;
        v_total := v_total + 1;
      END;
    END LOOP;
  END LOOP;

  -- Compute Shannon entropy
  FOR i IN 1..100
  LOOP
    IF v_freq[i] > 0 THEN
      v_p := v_freq[i] / v_total;
      v_entropy := v_entropy - (v_p * log(2, v_p));
    END IF;
  END LOOP;

  -- Max entropy for 100 outcomes is log2(100) ≈ 6.6439
  v_entropy := ROUND(v_entropy / 6.6439, 6); -- Normalize to 0-1

  -- Compute trend (compare first half vs second half)
  -- Simplified: if entropy > 0.9 = stable, 0.7-0.9 = moderate, < 0.7 = chaotic
  IF v_entropy > 0.9 THEN
    v_trend := 'stable';
    v_alert := FALSE;
  ELSIF v_entropy > 0.7 THEN
    v_trend := 'moderate';
    v_alert := FALSE;
  ELSE
    v_trend := 'chaotic';
    v_alert := TRUE;
  END IF;

  -- Build distribution JSONB
  v_dist := '{}'::jsonb;
  FOR i IN 1..100
  LOOP
    IF v_freq[i] > 0 THEN
      v_dist := jsonb_set(v_dist, ARRAY[(i-1)::TEXT], ROUND((v_freq[i] / v_total), 6)::TEXT::jsonb);
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_entropy, v_trend, v_alert, v_dist;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === 4. RPC: Compute survival hazard rates ===
CREATE OR REPLACE FUNCTION compute_survival_hazard(
  p_turno TEXT,
  p_limit INTEGER DEFAULT 500
) RETURNS TABLE (
  hazard JSONB,
  critical_numbers JSONB
) AS $$
DECLARE
  v_draws RECORD;
  v_last_seen INTEGER[];
  v_gaps NUMERIC[] := ARRAY_FILL(0, ARRAY[100]);
  v_current_draw INTEGER := 0;
  v_critical JSONB := '[]'::jsonb;
  v_avg_hazard NUMERIC := 0;
  v_count INTEGER := 0;
  v_hazard_arr NUMERIC[] := ARRAY_FILL(0, ARRAY[100]);
  v_hazard_json JSONB := '{}'::jsonb;
BEGIN
  v_last_seen := ARRAY_FILL(-1, ARRAY[100]);

  FOR v_draws IN
    SELECT numbers
    FROM draws
    WHERE turno ILIKE '%' || p_turno || '%'
    ORDER BY date ASC
    LIMIT p_limit
  LOOP
    v_current_draw := v_current_draw + 1;
    FOR i IN 1..array_length(v_draws.numbers, 1)
    LOOP
      DECLARE v_num INTEGER := v_draws.numbers[i] % 100;
      BEGIN
        IF v_last_seen[v_num + 1] >= 0 THEN
          v_gaps[v_num + 1] := v_gaps[v_num + 1] + (v_current_draw - v_last_seen[v_num + 1]);
        END IF;
        v_last_seen[v_num + 1] := v_current_draw;
      END;
    END LOOP;
  END LOOP;

  FOR i IN 1..100
  LOOP
    IF v_last_seen[i] >= 0 AND v_gaps[i] > 0 THEN
      v_hazard_arr[i] := ROUND(1.0 / (v_gaps[i] / (v_current_draw - v_last_seen[i])), 6);
      v_count := v_count + 1;
      v_avg_hazard := v_avg_hazard + v_hazard_arr[i];
    END IF;
  END LOOP;

  IF v_count > 0 THEN
    v_avg_hazard := v_avg_hazard / v_count;
  END IF;

  FOR i IN 1..100
  LOOP
    IF v_hazard_arr[i] > v_avg_hazard * 1.5 THEN
      v_critical := v_critical || jsonb_build_object(
        'number', i - 1,
        'hazard', v_hazard_arr[i],
        'ratio', ROUND(v_hazard_arr[i] / NULLIF(v_avg_hazard, 0), 2)
      );
    END IF;
  END LOOP;

  FOR i IN 1..100
  LOOP
    IF v_last_seen[i] >= 0 THEN
      v_hazard_json := jsonb_set(v_hazard_json, ARRAY[(i-1)::TEXT], ROUND(v_hazard_arr[i], 6)::TEXT::jsonb);
    END IF;
  END LOOP;

  RETURN QUERY SELECT v_hazard_json, v_critical;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === 5. RPC: Get latest turn_analytics ===
CREATE OR REPLACE FUNCTION get_latest_analytics(
  p_turno TEXT
) RETURNS SETOF turn_analytics AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM turn_analytics
  WHERE turno = p_turno
  ORDER BY fecha_calculo DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === DONE ===
