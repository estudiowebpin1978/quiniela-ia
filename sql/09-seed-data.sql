-- ============================================================================
-- 09-seed-data.sql: Initial seed data for production
-- Ejecutar DESPUÉS de 08-triggers.sql
-- ============================================================================

-- ============================================================================
-- 1. GAMES (seed data)
-- ============================================================================
INSERT INTO games (slug, name, number_count, number_range_min, number_range_max, turns, config) VALUES
('quiniela', 'Quiniela Nacional', 20, 0, 9999,
  '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::JSONB,
  '{"description": "Quiniela Nacional Argentina - 5 turnos diarios"}'::JSONB),
('quini6', 'Quini 6', 6, 0, 45,
  '["Tradicional","Segunda","Revancha","Siempre Sale"]'::JSONB,
  '{"description": "Quini 6 - 4 sorteos semanales"}'::JSONB)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  config = EXCLUDED.config;

-- ============================================================================
-- 2. ADMIN USER (estudiowebpin@gmail.com)
-- ============================================================================
-- This is handled by the TypeScript auth system, not SQL.
-- The admin check is in lib/auth/tier.ts: isAdmin(email)

-- ============================================================================
-- 3. ML MODEL SEED (empty models for initial state)
-- ============================================================================
INSERT INTO ml_models (game_id, turno, modelos)
SELECT
  g.id,
  t.turno,
  '{"markov": {"trained": false}, "random_forest": {"trained": false}, "neural": {"trained": false}}'::JSONB
FROM games g
FROM games g,
     LATERAL jsonb_array_elements_text(g.turns) AS t(turno)
WHERE g.slug = 'quiniela'
  AND NOT EXISTS (
    SELECT 1 FROM ml_models ml WHERE ml.game_id = g.id AND ml.turno = t.turno
  );

-- ============================================================================
-- 4. MOTOR PERFORMANCE SEED (all motors start with equal weight)
-- ============================================================================
INSERT INTO motor_performance (game_id, motor, turno, accuracy, times_used)
SELECT
  g.id,
  m.motor,
  t.turno,
  0.5,
  0
FROM games g,
     LATERAL jsonb_array_elements_text(g.turns) AS t(turno),
     LATERAL UNNEST(ARRAY[
  'factores30', 'montecarlo', 'crossTurno', 'correlation',
  'markovSuperior', 'cyclicPatterns', 'featureEngineering',
  'multilevelScoring', 'pmiCooccurrence', 'advancedMarkov',
  'positionAnalysis', 'ensembleML', 'graphAnalysis',
  'bayesian', 'metaLearner', 'pesosDinamicos',
  'entropy', 'survival', 'interTurno', 'genetic'
]) AS m(motor)
WHERE g.slug = 'quiniela'
  AND NOT EXISTS (
    SELECT 1 FROM motor_performance mp
    WHERE mp.game_id = g.id AND mp.motor = m.motor AND mp.turno = t.turno
  );

-- ============================================================================
-- 5. INITIAL TURN ANALYTICS (empty, computed by cron)
-- ============================================================================
-- Analytics are computed daily by cron-analytics RPC.
-- No seed data needed.

-- ============================================================================
-- 6. INITIAL BACKTEST RESULTS (empty, computed by cron)
-- ============================================================================
-- Backtest results are computed daily by run_daily_backtest RPC.
-- No seed data needed.
