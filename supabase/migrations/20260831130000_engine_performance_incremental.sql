-- MÓDULO 4 — Actualización de Esquema y Meta-Ensemble Weights
-- Función incremental: los callers pasan (p_engine_name, p_hit, p_near_miss)
-- y la función incrementa contadores. Sin recálculo batch desde raw data.

-- 1. Agregar columnas incrementales
ALTER TABLE engine_performance ADD COLUMN IF NOT EXISTS hit_count INT DEFAULT 0;
ALTER TABLE engine_performance ADD COLUMN IF NOT EXISTS total_runs INT DEFAULT 0;

-- 2. Migrar datos existentes: hit_count = win_rate_last_10 * ~10 draws
UPDATE engine_performance SET
  hit_count = ROUND(win_rate_last_10 * 10),
  total_runs = 10
WHERE total_runs = 0 OR total_runs IS NULL;

-- 3. Eliminar la función antigua (set-based batch recalculation)
DROP FUNCTION IF EXISTS update_engine_performance();

-- 4. Crear la función incremental según el spec del usuario
CREATE OR REPLACE FUNCTION update_engine_performance(
  p_engine_name TEXT,
  p_hit BOOLEAN,
  p_near_miss BOOLEAN
) RETURNS void AS $$
BEGIN
  -- Si no existe la fila para el motor, se crea
  INSERT INTO engine_performance (turno, engine_name, hit_count, near_miss_count, total_runs, updated_at)
  VALUES (
    'ALL',  -- Default turno; callers can override via SET e.turno
    p_engine_name,
    CASE WHEN p_hit THEN 1 ELSE 0 END,
    CASE WHEN p_near_miss THEN 1 ELSE 0 END,
    1,
    NOW()
  )
  ON CONFLICT (turno, engine_name)
  DO UPDATE SET
    total_runs = engine_performance.total_runs + 1,
    hit_count = engine_performance.hit_count + CASE WHEN p_hit THEN 1 ELSE 0 END,
    near_miss_count = engine_performance.near_miss_count + CASE WHEN p_near_miss THEN 1 ELSE 0 END,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 5. Mantener la función batch para cron jobs (recálculo periódico completo)
CREATE OR REPLACE FUNCTION recalculate_engine_performance()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    WITH ranked_draws AS (
        SELECT
            id,
            turno,
            numbers[1] AS cabeza,
            ROW_NUMBER() OVER(PARTITION BY turno ORDER BY date DESC, id DESC) AS rn
        FROM draws
        WHERE numbers IS NOT NULL AND array_length(numbers, 1) > 0
    ),
    last_10 AS (
        SELECT * FROM ranked_draws WHERE rn <= 10
    ),
    engine_hits AS (
        SELECT
            e.turno,
            e.engine_name,
            COUNT(e.draw_id) AS draws_evaluated,
            SUM(
                CASE WHEN EXISTS (
                    SELECT 1 FROM unnest(e.predicted_numbers) AS pn
                    WHERE (pn % 100) = (t.cabeza % 100)
                ) THEN 1 ELSE 0 END
            ) AS successful_draws,
            SUM(
                CASE WHEN EXISTS (
                    SELECT 1 FROM unnest(e.predicted_numbers) AS pn
                    WHERE ABS((pn % 100) - (t.cabeza % 100)) = 1
                ) AND NOT EXISTS (
                    SELECT 1 FROM unnest(e.predicted_numbers) AS pn
                    WHERE (pn % 100) = (t.cabeza % 100)
                ) THEN 1 ELSE 0 END
            ) AS near_miss_count
        FROM engine_predictions_log e
        JOIN last_10 t ON t.id = e.draw_id
        GROUP BY e.turno, e.engine_name
    )
    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, hit_count, near_miss_count, total_runs, updated_at)
    SELECT
        turno,
        engine_name,
        ROUND((successful_draws::numeric / NULLIF(draws_evaluated, 0)::numeric), 4),
        successful_draws,
        near_miss_count,
        draws_evaluated,
        NOW()
    FROM engine_hits
    ON CONFLICT (turno, engine_name)
    DO UPDATE SET
        win_rate_last_10 = EXCLUDED.win_rate_last_10,
        hit_count = EXCLUDED.hit_count,
        near_miss_count = EXCLUDED.near_miss_count,
        total_runs = EXCLUDED.total_runs,
        updated_at = NOW();
END;
$$;

-- 6. Mantener el access para cron jobs
GRANT EXECUTE ON FUNCTION recalculate_engine_performance() TO service_role;
GRANT EXECUTE ON FUNCTION update_engine_performance(TEXT, BOOLEAN, BOOLEAN) TO service_role;
