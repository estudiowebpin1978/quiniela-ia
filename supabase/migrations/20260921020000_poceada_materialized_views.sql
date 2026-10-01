-- Add Poceada to materialized views and engine_config
-- Previously, materialized views only included Nacional (game_id = 'ac593199-...')
-- This migration adds Poceada data to enable proper predictions

-- 1. Recreate draw_stats to include BOTH Nacional and Poceada
DROP MATERIALIZED VIEW IF EXISTS draw_stats;
CREATE MATERIALIZED VIEW draw_stats AS
SELECT
  d.turno,
  d.game_id,
  unnest(d.numbers) AS numero,
  COUNT(*) AS frequency,
  MAX(d.date) AS last_seen,
  MIN(d.date) AS first_seen
FROM draws d
WHERE d.numbers IS NOT NULL
  AND d.game_id IN ('ac593199-c299-4f03-b1b7-8675fe4fa6d9', 'd0e1f2a3-b4c5-6789-0abc-def012345678')
GROUP BY d.turno, d.game_id, unnest(d.numbers);

CREATE UNIQUE INDEX idx_draw_stats_turno_game_num ON draw_stats (turno, game_id, numero);

-- 2. Recreate markov_transitions to include BOTH Nacional and Poceada
DROP MATERIALIZED VIEW IF EXISTS markov_transitions;
CREATE MATERIALIZED VIEW markov_transitions AS
WITH numbered AS (
  SELECT
    d.turno,
    d.game_id,
    d.date,
    unnest(d.numbers) AS numero,
    ROW_NUMBER() OVER (PARTITION BY d.turno, d.game_id, d.date ORDER BY ordinality) AS pos
  FROM draws d
  CROSS JOIN unnest(d.numbers) WITH ORDINALITY
  WHERE d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) >= 2
    AND d.game_id IN ('ac593199-c299-4f03-b1b7-8675fe4fa6d9', 'd0e1f2a3-b4c5-6789-0abc-def012345678')
),
transitions AS (
  SELECT
    n1.turno,
    n1.game_id,
    n1.numero AS from_num,
    n2.numero AS to_num,
    COUNT(*) AS transition_count
  FROM numbered n1
  JOIN numbered n2 ON n1.turno = n2.turno
    AND n1.game_id = n2.game_id
    AND n1.date = n2.date
    AND n2.pos = n1.pos + 1
  GROUP BY n1.turno, n1.game_id, n1.numero, n2.numero
)
SELECT
  t.turno,
  t.game_id,
  t.from_num,
  t.to_num,
  t.transition_count,
  s.frequency AS from_frequency,
  CASE WHEN s.frequency > 0 THEN t.transition_count::float / s.frequency ELSE 0 END AS probability
FROM transitions t
JOIN draw_stats s ON t.turno = s.turno AND t.game_id = s.game_id AND t.from_num = s.numero;

CREATE INDEX idx_markov_turno_game_from ON markov_transitions (turno, game_id, from_num);

-- 3. Recreate cooccurrence_matrix to include BOTH Nacional and Poceada
DROP MATERIALIZED VIEW IF EXISTS cooccurrence_matrix;
CREATE MATERIALIZED VIEW cooccurrence_matrix AS
WITH draw_pairs AS (
  SELECT
    d.turno,
    d.game_id,
    d.date,
    a.unnest AS num_a,
    b.unnest AS num_b
  FROM draws d
  CROSS JOIN unnest(d.numbers) a
  CROSS JOIN unnest(d.numbers) b
  WHERE d.numbers IS NOT NULL
    AND array_length(d.numbers, 1) >= 2
    AND a.unnest < b.unnest
    AND d.game_id IN ('ac593199-c299-4f03-b1b7-8675fe4fa6d9', 'd0e1f2a3-b4c5-6789-0abc-def012345678')
)
SELECT
  turno,
  game_id,
  num_a,
  num_b,
  COUNT(*) AS cooccurrence_count
FROM draw_pairs
GROUP BY turno, game_id, num_a, num_b;

CREATE INDEX idx_cooccurrence_turno_game ON cooccurrence_matrix (turno, game_id, num_a, num_b);

-- 4. Add engine_config for Poceada
INSERT INTO engine_config (engine_version, turno) VALUES
  ('omega_v6', 'Poceada')
ON CONFLICT (engine_version, turno) DO NOTHING;

-- 5. Refresh all materialized views
REFRESH MATERIALIZED VIEW draw_stats;
REFRESH MATERIALIZED VIEW markov_transitions;
REFRESH MATERIALIZED VIEW cooccurrence_matrix;
