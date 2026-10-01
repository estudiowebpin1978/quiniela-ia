-- AUDITORÍA FINAL: 1. FUENTE ÚNICA DE VERDAD
-- Verifica que predictions_cache, draws, engine_performance, walkforward_results usen datos consistentes

SELECT
  'FUENTE_UNICA' AS audit_category,
  'draws' AS table_name,
  COUNT(DISTINCT turno) AS turno_count,
  COUNT(*) AS total_draws,
  MIN(date) AS first_date,
  MAX(date) AS last_date
FROM draws
WHERE turno IN ('Previa','Primera','Matutina','Vespertina','Nocturna')

UNION ALL

SELECT
  COUNT(DISTINCT turno)::TEXT AS turno_count,
  COUNT(*)::TEXT AS total_draws,
  MIN(date)::TEXT AS first_date,
  MAX(date)::TEXT AS last_date
FROM predictions_cache
WHERE game_id = 'ac593199-c299-4f03-b1b7-8675fe4fa6d9';
