-- Backtesting histórico: métricas de precisión por modelo/turno/fecha
-- Ejecutar en Supabase SQL Editor

CREATE TABLE IF NOT EXISTS backtest_results (
    id BIGSERIAL PRIMARY KEY,
    turno TEXT NOT NULL,
    model_type TEXT NOT NULL,           -- 'ensemble', 'lgbm', 'xgboost', 'markov', 'rf', 'neural'
    test_date DATE NOT NULL,            -- fecha del sorteo testeado
    train_window_start DATE NOT NULL,   -- inicio ventana entrenamiento
    train_window_end DATE NOT NULL,     -- fin ventana entrenamiento
    
    -- Métricas 2 cifras
    hit_at_1_2c BOOLEAN DEFAULT FALSE,
    hit_at_5_2c BOOLEAN DEFAULT FALSE,
    hit_at_10_2c BOOLEAN DEFAULT FALSE,
    rank_2c INT,                        -- posición del número real en ranking (1-100)
    score_2c NUMERIC(6,4),              -- score asignado al número real
    
    -- Métricas 3 cifras
    hit_at_1_3c BOOLEAN DEFAULT FALSE,
    hit_at_5_3c BOOLEAN DEFAULT FALSE,
    hit_at_10_3c BOOLEAN DEFAULT FALSE,
    rank_3c INT,
    score_3c NUMERIC(6,4),
    
    -- Métricas 4 cifras
    hit_at_1_4c BOOLEAN DEFAULT FALSE,
    hit_at_5_4c BOOLEAN DEFAULT FALSE,
    hit_at_10_4c BOOLEAN DEFAULT FALSE,
    rank_4c INT,
    score_4c NUMERIC(6,4),
    
    -- Redoblona
    redoblona_hit BOOLEAN DEFAULT FALSE,
    
    -- ROI simulado (apostando $10 por número top-10)
    roi_2c NUMERIC(8,2) DEFAULT 0,
    roi_3c NUMERIC(8,2) DEFAULT 0,
    roi_4c NUMERIC(8,2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(turno, model_type, test_date, train_window_start)
);

CREATE INDEX IF NOT EXISTS idx_backtest_turno_date ON backtest_results(turno, test_date DESC);
CREATE INDEX IF NOT EXISTS idx_backtest_model ON backtest_results(model_type, test_date DESC);

-- RLS: solo service_role escribe, todos leen
ALTER TABLE backtest_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read backtest" ON backtest_results;
CREATE POLICY "Public read backtest" ON backtest_results
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service write backtest" ON backtest_results;
CREATE POLICY "Service write backtest" ON backtest_results
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- RPC: calcular backtesting para un rango de fechas
CREATE OR REPLACE FUNCTION compute_backtest(
    p_turno TEXT,
    p_model_type TEXT,
    p_start_date DATE,
    p_end_date DATE,
    p_train_days INT DEFAULT 365,
    p_test_days INT DEFAULT 30
) RETURNS TABLE(
    test_date DATE,
    hit_at_1_2c BOOLEAN,
    hit_at_5_2c BOOLEAN,
    hit_at_10_2c BOOLEAN,
    rank_2c INT,
    hit_at_1_3c BOOLEAN,
    hit_at_5_3c BOOLEAN,
    hit_at_10_3c BOOLEAN,
    rank_3c INT,
    hit_at_1_4c BOOLEAN,
    hit_at_5_4c BOOLEAN,
    hit_at_10_4c BOOLEAN,
    rank_4c INT,
    redoblona_hit BOOLEAN,
    roi_2c NUMERIC,
    roi_3c NUMERIC,
    roi_4c NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    r RECORD;
    draw_numbers INT[];
    pred_2c INT[];
    pred_3c INT[];
    pred_4c INT[];
    pred_redoblona TEXT[];
BEGIN
    -- Para cada fecha de test en el rango
    FOR r IN SELECT date FROM draws 
             WHERE turno = p_turno 
               AND date BETWEEN p_start_date AND p_end_date
               AND array_length(numbers, 1) >= 20
             ORDER BY date
    LOOP
        -- Obtener sorteo real
        SELECT numbers INTO draw_numbers FROM draws 
        WHERE turno = p_turno AND date = r.date AND array_length(numbers, 1) >= 20;
        
        IF draw_numbers IS NULL THEN CONTINUE; END IF;
        
        -- Simular predicción: usar modelo guardado más cercano anterior a test_date
        -- (En producción esto lo hace el Python backend; aquí es placeholder)
        -- Para MVP: devolvemos NULLs, el Python llena la tabla via INSERT
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Vista agregada: métricas resumidas por modelo/turno
CREATE OR REPLACE VIEW backtest_summary AS
SELECT 
    turno,
    model_type,
    COUNT(*) AS total_tests,
    ROUND(100.0 * SUM(hit_at_1_2c::INT) / COUNT(*), 2) AS hit_at_1_2c_pct,
    ROUND(100.0 * SUM(hit_at_5_2c::INT) / COUNT(*), 2) AS hit_at_5_2c_pct,
    ROUND(100.0 * SUM(hit_at_10_2c::INT) / COUNT(*), 2) AS hit_at_10_2c_pct,
    ROUND(100.0 * SUM(hit_at_1_3c::INT) / COUNT(*), 2) AS hit_at_1_3c_pct,
    ROUND(100.0 * SUM(hit_at_5_3c::INT) / COUNT(*), 2) AS hit_at_5_3c_pct,
    ROUND(100.0 * SUM(hit_at_10_3c::INT) / COUNT(*), 2) AS hit_at_10_3c_pct,
    ROUND(100.0 * SUM(hit_at_1_4c::INT) / COUNT(*), 2) AS hit_at_1_4c_pct,
    ROUND(100.0 * SUM(redoblona_hit::INT) / COUNT(*), 2) AS redoblona_pct,
    ROUND(AVG(roi_2c), 2) AS avg_roi_2c,
    ROUND(AVG(roi_3c), 2) AS avg_roi_3c,
    ROUND(AVG(roi_4c), 2) AS avg_roi_4c,
    MAX(test_date) AS last_test_date
FROM backtest_results
GROUP BY turno, model_type
ORDER BY turno, model_type;