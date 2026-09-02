-- Migration: Fix engine_performance column mismatch
-- Problem: update_engine_performance() writes to `last_updated`,
-- but TypeScript reads `updated_at`. These are different columns,
-- causing decay calculations to use stale timestamps.
--
-- Fix: update_engine_performance() now writes to `updated_at`.
-- Drop the redundant `last_updated` column.
-- Also add near_miss_count for future near-miss bonus activation.

-- 1. Drop the old function
DROP FUNCTION IF EXISTS update_engine_performance();

-- 2. Recreate with correct column: writes to `updated_at` + calculates near_miss_count
CREATE OR REPLACE FUNCTION update_engine_performance()
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
            -- Exact matches (cabeza % 100 == predicted % 100)
            SUM(
                CASE WHEN EXISTS (
                    SELECT 1 FROM unnest(e.predicted_numbers) AS pn
                    WHERE (pn % 100) = (t.cabeza % 100)
                ) THEN 1 ELSE 0 END
            ) AS successful_draws,
            -- Near-misses: predicted within ±1 of actual (e.g., 45 vs 46)
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
    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, near_miss_count, updated_at)
    SELECT
        turno,
        engine_name,
        ROUND((successful_draws::numeric / NULLIF(draws_evaluated, 0)::numeric), 4),
        near_miss_count,
        NOW()
    FROM engine_hits
    ON CONFLICT (turno, engine_name)
    DO UPDATE SET
        win_rate_last_10 = EXCLUDED.win_rate_last_10,
        near_miss_count = EXCLUDED.near_miss_count,
        updated_at = NOW();
END;
$$;

-- 3. Add near_miss_count column to engine_performance
ALTER TABLE engine_performance ADD COLUMN IF NOT EXISTS near_miss_count INT DEFAULT 0;

-- 4. Drop the redundant last_updated column (now using updated_at exclusively)
ALTER TABLE engine_performance DROP COLUMN IF EXISTS last_updated;
