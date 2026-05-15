-- ============================================
-- QUINIELA IA - Esquema de Base de Datos
-- Sistema de Predicciones Avanzado
-- ============================================

-- ============================================
-- TABLA: draws (Sorteos)
-- ============================================
CREATE TABLE IF NOT EXISTS draws (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    turno TEXT NOT NULL,
    numbers INTEGER[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para draws
CREATE INDEX IF NOT EXISTS idx_draws_date ON draws(date DESC);
CREATE INDEX IF NOT EXISTS idx_draws_turno ON draws(turno);
CREATE INDEX IF NOT EXISTS idx_draws_date_turno ON draws(date DESC, turno);

-- ============================================
-- TABLA: predictions (Predicciones)
-- ============================================
CREATE TABLE IF NOT EXISTS predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fecha DATE NOT NULL,
    turno TEXT NOT NULL,
    numeros_2 TEXT[] NOT NULL,
    numeros_3 TEXT[],
    numeros_4 TEXT[],
    redoblona TEXT,
    score_promedio REAL,
    confianza_promedio REAL,
    metodologia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_fecha ON predictions(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_predictions_turno ON predictions(turno);

-- ============================================
-- TABLA: prediction_results (Resultados)
-- ============================================
CREATE TABLE IF NOT EXISTS prediction_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prediction_id UUID REFERENCES predictions(id),
    resultado_fecha DATE NOT NULL,
    resultado_turno TEXT NOT NULL,
    resultado_numeros TEXT[],
    aciertos_2cifras INTEGER DEFAULT 0,
    aciertos_3cifras INTEGER DEFAULT 0,
    aciertos_4cifras INTEGER DEFAULT 0,
    precision_total REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- TABLA: frequencies (Frecuencias)
-- ============================================
CREATE TABLE IF NOT EXISTS frequencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno TEXT NOT NULL,
    tipo TEXT NOT NULL, -- '2cifras', '3cifras', '4cifras'
    numero INTEGER NOT NULL,
    frecuencia INTEGER NOT NULL,
    porcentaje REAL,
    tendencia REAL,
    ultimo_sorteo DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(turno, tipo, numero)
);

CREATE INDEX IF NOT EXISTS idx_frequencies_lookup ON frequencies(turno, tipo, numero DESC);

-- ============================================
-- TABLA: absences (Ausencias)
-- ============================================
CREATE TABLE IF NOT EXISTS absences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno TEXT NOT NULL,
    numero INTEGER NOT NULL,
    ultimo_sorteo DATE,
    dias_ausente INTEGER,
    turnos_ausente INTEGER,
    probabilidad_retorno REAL,
    estado TEXT, -- 'caliente', 'tibio', 'frio', 'atrasado'
    ciclo_promedio REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(turno, numero)
);

-- ============================================
-- TABLA: transitions (Transiciones/Markov)
-- ============================================
CREATE TABLE IF NOT EXISTS transitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno TEXT NOT NULL,
    desde INTEGER NOT NULL,
    hacia INTEGER NOT NULL,
    frecuencia INTEGER NOT NULL,
    probabilidad REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(turno, desde, hacia)
);

CREATE INDEX IF NOT EXISTS idx_transitions_lookup ON transitions(turno, desde, hacia);

-- ============================================
-- TABLA: cycles (Ciclos)
-- ============================================
CREATE TABLE IF NOT EXISTS cycles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno TEXT NOT NULL,
    numero INTEGER NOT NULL,
    ciclo_promedio REAL,
    ciclo_minimo INTEGER,
    ciclo_maximo INTEGER,
    ultimo_ciclo INTEGER,
    tendencia TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(turno, numero)
);

-- ============================================
-- TABLA: model_scores (Scores de ML)
-- ============================================
CREATE TABLE IF NOT EXISTS model_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modelo TEXT NOT NULL,
    turno TEXT NOT NULL,
    precision_top1 REAL,
    precision_top5 REAL,
    precision_top10 REAL,
    f1_score REAL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_scores_fecha ON model_scores(created_at DESC);

-- ============================================
-- TABLA: user_predictions (Predicciones de usuarios)
-- ============================================
CREATE TABLE IF NOT EXISTS user_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID,
    date DATE NOT NULL,
    turno TEXT NOT NULL,
    numeros TEXT[] NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_predictions_user ON user_predictions(user_id, fecha DESC);

-- ============================================
-- TABLA: analytics_cache (Cache de análisis)
-- ============================================
CREATE TABLE IF NOT EXISTS analytics_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tipo TEXT NOT NULL, -- 'frecuencia', 'ausencias', 'ciclos', etc.
    turno TEXT NOT NULL,
    dias INTEGER NOT NULL,
    data JSONB NOT NULL,
    valid_until TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tipo, turno, dias)
);

-- ============================================
-- TABLA: posiciones (Análisis por posiciones)
-- ============================================
CREATE TABLE IF NOT EXISTS posiciones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    turno TEXT NOT NULL,
    posicion TEXT NOT NULL, -- 'miles', 'centenas', 'decenas', 'unidades'
    digito INTEGER NOT NULL,
    frecuencia INTEGER NOT NULL,
    porcentaje REAL,
    tendencia REAL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(turno, posicion, digito)
);

-- ============================================
-- Función para actualizar updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para draws
DROP TRIGGER IF EXISTS update_draws_updated_at ON draws;
CREATE TRIGGER update_draws_updated_at
    BEFORE UPDATE ON draws
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================
-- Funciones útiles
-- ============================================

-- Función para obtener últimos N sorteos por turno
CREATE OR REPLACE FUNCTION get_last_draws(p_turno TEXT, p_limit INTEGER)
RETURNS TABLE(date DATE, turno TEXT, numbers INTEGER[]) AS $$
BEGIN
    RETURN QUERY
    SELECT d.date, d.turno, d.numbers
    FROM draws d
    WHERE d.turno ILIKE '%' || p_turno || '%'
    ORDER BY d.date DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener frecuencia por turno
CREATE OR REPLACE FUNCTION get_frequencies(p_turno TEXT, p_tipo TEXT, p_days INTEGER DEFAULT 90)
RETURNS TABLE(numero INTEGER, frecuencia INTEGER, porcentaje REAL) AS $$
BEGIN
    RETURN QUERY
    WITH datos AS (
        SELECT unnest(d.numbers) as num
        FROM draws d
        WHERE d.turno ILIKE '%' || p_turno || '%'
        AND d.date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
    ),
    freqs AS (
        SELECT 
            CASE 
                WHEN p_tipo = '2cifras' THEN num % 100
                WHEN p_tipo = '3cifras' THEN num % 1000
                ELSE num
            END as numero,
            COUNT(*) as frecuencia
        FROM datos
        GROUP BY 1
    )
    SELECT 
        f.numero::INTEGER,
        f.frecuencia,
        (f.frecuencia::REAL / NULLIF(SUM(f.frecuencia) OVER(), 0) * 100)::REAL as porcentaje
    FROM freqs f
    ORDER BY f.frecuencia DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- Permisos (ajustar según necesidad)
-- ============================================
ALTER TABLE draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE frequencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE prediction_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE posiciones ENABLE ROW LEVEL SECURITY;

-- Políticas para acceso público a datos de lectura
CREATE POLICY "Public read access" ON draws FOR SELECT USING (true);
CREATE POLICY "Public read access" ON predictions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON frequencies FOR SELECT USING (true);
CREATE POLICY "Public read access" ON absences FOR SELECT USING (true);
CREATE POLICY "Public read access" ON transitions FOR SELECT USING (true);
CREATE POLICY "Public read access" ON cycles FOR SELECT USING (true);
CREATE POLICY "Public read access" ON model_scores FOR SELECT USING (true);

-- Acceso para servicio (service role puede escribir)
CREATE POLICY "Service write access" ON draws FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON predictions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON frequencies FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON absences FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON transitions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON cycles FOR INSERT WITH CHECK (true);
CREATE POLICY "Service write access" ON model_scores FOR INSERT WITH CHECK (true);

-- ============================================
-- Vista: resumen_analisis
-- ============================================
CREATE OR REPLACE VIEW resumen_analisis AS
SELECT 
    d.turno,
    COUNT(DISTINCT d.date) as total_dias,
    COUNT(*) as total_sorteos,
    COUNT(d.numbers) as total_numeros,
    MAX(d.date) as ultimo_sorteo,
    MIN(d.date) as primer_sorteo
FROM draws d
GROUP BY d.turno
ORDER BY d.turno;

-- ============================================
-- Vista: top_numeros_por_turno
-- ============================================
CREATE OR REPLACE VIEW top_numeros_por_turno AS
SELECT 
    d.turno,
    (num % 100)::INTEGER as terminacion,
    COUNT(*) as frecuencia,
    ROUND(COUNT(*)::REAL / NULLIF(SUM(COUNT(*)) OVER(PARTITION BY d.turno), 0) * 100, 2) as porcentaje
FROM draws d,
     unnest(d.numbers) as num
GROUP BY d.turno, terminacion
ORDER BY d.turno, frecuencia DESC
LIMIT 500;