-- Meta-Ensamble Dinámico: tablas + stored procedure

CREATE TABLE IF NOT EXISTS engine_predictions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draw_id UUID REFERENCES draws(id) ON DELETE CASCADE,
    turno VARCHAR(20) NOT NULL,
    engine_name VARCHAR(10) NOT NULL CHECK (engine_name IN ('V6', 'V7', 'ML')),
    predicted_numbers INT[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(draw_id, engine_name)
);

CREATE TABLE IF NOT EXISTS engine_performance (
    turno VARCHAR(20) NOT NULL,
    engine_name VARCHAR(10) NOT NULL,
    win_rate_last_10 NUMERIC(5,4) DEFAULT 0.3333,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (turno, engine_name)
);

INSERT INTO engine_performance (turno, engine_name, win_rate_last_10)
SELECT t.turno, e.engine_name, 0.3333
FROM unnest(ARRAY['Previa','Primera','Matutina','Vespertina','Nocturna']) AS t(turno)
CROSS JOIN unnest(ARRAY['V6','V7','ML']) AS e(engine_name)
ON CONFLICT (turno, engine_name) DO NOTHING;

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
            SUM(
                CASE WHEN EXISTS (
                    SELECT 1 FROM unnest(e.predicted_numbers) AS pn
                    WHERE (pn % 100) = (t.cabeza % 100)
                ) THEN 1 ELSE 0 END
            ) AS successful_draws
        FROM engine_predictions_log e
        JOIN last_10 t ON t.id = e.draw_id
        GROUP BY e.turno, e.engine_name
    )
    INSERT INTO engine_performance (turno, engine_name, win_rate_last_10, last_updated)
    SELECT
        turno,
        engine_name,
        ROUND((successful_draws::numeric / NULLIF(draws_evaluated, 0)::numeric), 4),
        NOW()
    FROM engine_hits
    ON CONFLICT (turno, engine_name)
    DO UPDATE SET
        win_rate_last_10 = EXCLUDED.win_rate_last_10,
        last_updated = EXCLUDED.last_updated;
END;
$$;
