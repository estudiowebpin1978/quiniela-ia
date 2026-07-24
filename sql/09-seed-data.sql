-- ============================================================================
-- 09-seed-data.sql: Initial seed data (fully idempotent)
-- ============================================================================

-- ============================================================================
-- 1. GAMES SEED
-- ============================================================================
INSERT INTO games (slug, name, number_count, number_range_min, number_range_max, turns) VALUES
('quiniela', 'Quiniela Nacional', 20, 0, 9999,
  '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::JSONB)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;

-- ============================================================================
-- 2. ML MODELS SEED (per turno)
-- ============================================================================
INSERT INTO ml_models (game_id, turno, modelos)
SELECT g.id, t.turno,
  '{"markov": {"trained": false}, "random_forest": {"trained": false}, "neural": {"trained": false}}'::JSONB
FROM games g,
     LATERAL jsonb_array_elements_text(g.turns) AS t(turno)
WHERE g.slug = 'quiniela'
  AND NOT EXISTS (
    SELECT 1 FROM ml_models ml WHERE ml.game_id = g.id AND ml.turno = t.turno
  );

-- ============================================================================
-- 3. MOTOR PERFORMANCE SEED (20 motors x 5 turnos)
-- ============================================================================
INSERT INTO motor_performance (game_id, motor, turno, accuracy, times_used)
SELECT g.id, m.motor, t.turno, 0.5, 0
FROM games g,
     LATERAL jsonb_array_elements_text(g.turns) AS t(turno),
     LATERAL UNNEST(ARRAY[
       'factores30','montecarlo','crossTurno','correlation',
       'markovSuperior','cyclicPatterns','featureEngineering',
       'multilevelScoring','pmiCooccurrence','advancedMarkov',
       'positionAnalysis','ensembleML','graphAnalysis',
       'bayesian','metaLearner','pesosDinamicos',
       'entropy','survival','interTurno','genetic'
     ]) AS m(motor)
WHERE g.slug = 'quiniela'
  AND NOT EXISTS (
    SELECT 1 FROM motor_performance mp
    WHERE mp.game_id = g.id AND mp.motor = m.motor AND mp.turno = t.turno
  );
