-- ============================================================
-- MATERIALIZED VIEW: Pre-calculated draw statistics per turno
-- Eliminates O(n) scans on every prediction request.
-- ============================================================

-- 1. Materialized view: per-number stats per turno
CREATE MATERIALIZED VIEW IF NOT EXISTS draw_stats AS
WITH numbered_draws AS (
  SELECT
    d.turno,
    d.date,
    d.numbers,
    ROW_NUMBER() OVER (PARTITION BY d.turno ORDER BY d.date DESC) AS draw_rank,
    COUNT(*) OVER (PARTITION BY d.turno) AS total_draws
  FROM draws d
  WHERE d.game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
),
expanded AS (
  SELECT
    turno,
    date,
    draw_rank,
    total_draws,
    UNNEST(numbers) AS num
  FROM numbered_draws
)
SELECT
  turno,
  num,
  total_draws,
  -- Global frequency
  COUNT(*) AS global_freq,
  -- Windowed frequencies
  COUNT(*) FILTER (WHERE draw_rank <= 7) AS freq_7,
  COUNT(*) FILTER (WHERE draw_rank <= 30) AS freq_30,
  COUNT(*) FILTER (WHERE draw_rank <= 90) AS freq_90,
  -- Recency: draws since last appearance
  (SELECT MIN(d2.draw_rank)
   FROM numbered_draws d2
   WHERE d2.turno = e.turno AND e.num = ANY(d2.numbers)
  ) AS last_seen_rank,
  -- Gap analysis: average interval between appearances
  AVG(gap) AS avg_gap,
  -- Co-occurrence placeholder (computed separately due to complexity)
  NOW() AS computed_at
FROM expanded e
CROSS JOIN LATERAL (
  SELECT draw_rank - LAG(draw_rank) OVER (ORDER BY draw_rank) AS gap
  FROM expanded e2
  WHERE e2.turno = e.turno AND e2.num = e.num
) gaps
GROUP BY turno, num, total_draws;

-- 2. Unique index for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_draw_stats_turno_num
  ON draw_stats (turno, num);

-- 3. Index for windowed queries
CREATE INDEX IF NOT EXISTS idx_draw_stats_turno
  ON draw_stats (turno);

-- 4. Function to refresh the materialized view (called by trigger)
CREATE OR REPLACE FUNCTION refresh_draw_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Concurrent refresh to avoid locking reads
  REFRESH MATERIALIZED VIEW CONCURRENTLY draw_stats;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger: refresh after new draw is inserted
DROP TRIGGER IF EXISTS trg_refresh_draw_stats ON draws;
CREATE TRIGGER trg_refresh_draw_stats
  AFTER INSERT OR UPDATE ON draws
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_draw_stats();

-- 6. Markov transition matrix (pre-computed)
CREATE MATERIALIZED VIEW IF NOT EXISTS markov_transitions AS
WITH ordered_draws AS (
  SELECT
    turno,
    date,
    numbers,
    LAG(numbers) OVER (PARTITION BY turno ORDER BY date) AS prev_numbers
  FROM draws
  WHERE game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
),
transitions AS (
  SELECT
    turno,
    UNNEST(prev_numbers) AS from_num,
    UNNEST(numbers) AS to_num
  FROM ordered_draws
  WHERE prev_numbers IS NOT NULL
)
SELECT
  turno,
  from_num,
  to_num,
  COUNT(*) AS transition_count
FROM transitions
GROUP BY turno, from_num, to_num;

CREATE UNIQUE INDEX IF NOT EXISTS idx_markov_turno_from_to
  ON markov_transitions (turno, from_num, to_num);

-- 7. Co-occurrence matrix (pre-computed)
CREATE MATERIALIZED VIEW IF NOT EXISTS cooccurrence_matrix AS
WITH expanded AS (
  SELECT
    d.turno,
    d.date,
    UNNEST(d.numbers) AS num_a
  FROM draws d
  WHERE d.game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
),
pairs AS (
  SELECT
    e1.turno,
    e1.num_a AS num_a,
    e2.num_a AS num_b,
    e1.date
  FROM expanded e1
  JOIN expanded e2 ON e1.turno = e2.turno AND e1.date = e2.date AND e1.num_a < e2.num_a
)
SELECT
  turno,
  num_a,
  num_b,
  COUNT(*) AS cooccurrence_count
FROM pairs
GROUP BY turno, num_a, num_b;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cooccur_turno_a_b
  ON cooccurrence_matrix (turno, num_a, num_b);

-- 8. RPC: Get pre-calculated stats for V7 engine
CREATE OR REPLACE FUNCTION get_draw_stats(p_turno TEXT)
RETURNS TABLE (
  num INT,
  global_freq BIGINT,
  freq_7 BIGINT,
  freq_30 BIGINT,
  freq_90 BIGINT,
  last_seen_rank BIGINT,
  avg_gap DOUBLE PRECISION,
  total_draws BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ds.num::INT,
    ds.global_freq,
    ds.freq_7,
    ds.freq_30,
    ds.freq_90,
    ds.last_seen_rank,
    ds.avg_gap,
    ds.total_draws
  FROM draw_stats ds
  WHERE ds.turno = p_turno
  ORDER BY ds.num;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. RPC: Get Markov transitions for a turno
CREATE OR REPLACE FUNCTION get_markov_transitions(p_turno TEXT)
RETURNS TABLE (
  from_num INT,
  to_num INT,
  transition_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    mt.from_num::INT,
    mt.to_num::INT,
    mt.transition_count
  FROM markov_transitions mt
  WHERE mt.turno = p_turno;
END;
$$ LANGUAGE plpgsql STABLE;

-- 10. RPC: Get co-occurrences for a turno
CREATE OR REPLACE FUNCTION get_cooccurrences(p_turno TEXT)
RETURNS TABLE (
  num_a INT,
  num_b INT,
  cooccurrence_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    cm.num_a::INT,
    cm.num_b::INT,
    cm.cooccurrence_count
  FROM cooccurrence_matrix cm
  WHERE cm.turno = p_turno;
END;
$$ LANGUAGE plpgsql STABLE;

-- 11. Initial refresh (run once)
REFRESH MATERIALIZED VIEW draw_stats;
REFRESH MATERIALIZED VIEW markov_transitions;
REFRESH MATERIALIZED VIEW cooccurrence_matrix;
