-- ─────────────────────────────────────────────────────────────
-- Quiniela IA — Migraciones para mejoras de predicción
-- Ejecutar en Supabase Dashboard → SQL Editor (en orden)
-- ─────────────────────────────────────────────────────────────

-- ─── 001: Habilitar pgvector ────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── 002: Co-ocurrencia de redoblonas por turno (Quiniela Ciudad) ───
CREATE TABLE IF NOT EXISTS redoblonas_ciudad_coocurrencia (
  id BIGSERIAL PRIMARY KEY,
  turno TEXT NOT NULL CHECK (turno IN ('Previa','Primera','Matutina','Vespertina','Nocturna')),
  numero_a INTEGER NOT NULL CHECK (numero_a >= 0 AND numero_a <= 99),
  numero_b INTEGER NOT NULL CHECK (numero_b >= 0 AND numero_b <= 99),
  veces_juntos INTEGER NOT NULL DEFAULT 0 CHECK (veces_juntos >= 0),
  ultima_aparicion DATE,
  gap_promedio NUMERIC(6,2) DEFAULT 0,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(turno, numero_a, numero_b)
);

CREATE INDEX IF NOT EXISTS idx_redoblonas_ciudad_turno ON redoblonas_ciudad_coocurrencia(turno);
CREATE INDEX IF NOT EXISTS idx_redoblonas_ciudad_veces ON redoblonas_ciudad_coocurrencia(turno, veces_juntos DESC);

CREATE OR REPLACE FUNCTION actualizar_fecha_modificacion()
RETURNS TRIGGER AS $$
BEGIN
  NEW.actualizado_en = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_redoblonas_ciudad_updated_on ON redoblonas_ciudad_coocurrencia;
CREATE TRIGGER trg_redoblonas_ciudad_updated_on
  BEFORE UPDATE ON redoblonas_ciudad_coocurrencia
  FOR EACH ROW
  EXECUTE FUNCTION actualizar_fecha_modificacion();

-- ─── 005: Sorteos embeddings (pgvector) ─────────────────────
CREATE TABLE IF NOT EXISTS sorteos_embeddings (
  id BIGSERIAL PRIMARY KEY,
  fuente TEXT NOT NULL CHECK (fuente IN ('quiniela-ciudad')),
  fecha DATE NOT NULL,
  turno TEXT,
  numeros_json JSONB NOT NULL,
  embedding vector(384) NOT NULL,
  metadata JSONB DEFAULT '{}',
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fuente, fecha, turno)
);

CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_fuente ON sorteos_embeddings(fuente);
CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_fecha ON sorteos_embeddings(fecha);
CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_vector ON sorteos_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ─── 006: Funciones RPC ─────────────────────────────────────

-- 006a: Números atrasados por turno
CREATE OR REPLACE FUNCTION get_numeros_atrasados_turno(
  p_turno TEXT,
  p_limite INTEGER DEFAULT 30
)
RETURNS TABLE (
  numero INT,
  sorteos_sin_salir INT,
  frecuencia INT,
  turno TEXT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_total_sorteos INT;
  v_fecha_global DATE;
BEGIN
  -- Contar total de sorteos y obtener fecha más reciente para este turno
  SELECT COUNT(DISTINCT date), MAX(date)
  INTO v_total_sorteos, v_fecha_global
  FROM draws
  WHERE turno = p_turno
    AND jurisdiccion = 'CABA';

  IF v_total_sorteos IS NULL OR v_total_sorteos = 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH numeros_desglosados AS (
    SELECT
      date,
      (UNNEST(numbers) % 100) AS numero
    FROM draws
    WHERE turno = p_turno
      AND jurisdiccion = 'CABA'
  ),
  ultimas_apariciones AS (
    SELECT
      numero,
      MAX(date) AS ultima_fecha
    FROM numeros_desglosados
    GROUP BY numero
  ),
  fechas_ordenadas AS (
    SELECT DISTINCT date,
           ROW_NUMBER() OVER (ORDER BY date ASC) AS pos
    FROM draws
    WHERE turno = p_turno
      AND jurisdiccion = 'CABA'
  ),
  max_pos AS (
    SELECT MAX(pos) AS max_p FROM fechas_ordenadas
  ),
  atraso AS (
    SELECT
      ua.numero,
      mp.max_p - COALESCE(fp.pos, 0) AS sorteos_sin_salir,
      COUNT(nd.numero) AS frecuencia,
      p_turno AS turno
    FROM ultimas_apariciones ua
    LEFT JOIN fechas_ordenadas fp ON fp.date = ua.ultima_fecha
    CROSS JOIN max_pos mp
    LEFT JOIN numeros_desglosados nd ON nd.numero = ua.numero
    GROUP BY ua.numero, ua.ultima_fecha, fp.pos, mp.max_p
  )
  SELECT
    numero,
    sorteos_sin_salir,
    frecuencia,
    turno
  FROM atraso
  ORDER BY sorteos_sin_salir DESC
  LIMIT p_limite;
END;
$$;

-- 006b: Búsqueda de sorteos similares (pgvector)
CREATE OR REPLACE FUNCTION buscar_sorteos_similares(
  p_embedding vector(384),
  p_fuente TEXT,
  p_turno TEXT DEFAULT NULL,
  p_limite INTEGER DEFAULT 10
)
RETURNS TABLE (
  fuente TEXT,
  fecha TEXT,
  turno TEXT,
  numeros JSONB,
  similitud FLOAT,
  metadata JSONB
)
LANGUAGE sql STABLE AS $$
  SELECT
    fuente,
    fecha::TEXT AS fecha,
    turno,
    numeros_json AS numeros,
    1 - (embedding <=> p_embedding) AS similitud,
    metadata
  FROM sorteos_embeddings
  WHERE fuente = p_fuente
    AND (p_turno IS NULL OR turno = p_turno)
  ORDER BY embedding <=> p_embedding
  LIMIT p_limite;
$$;

-- 006c: Incrementar veces_juntos redoblona
CREATE OR REPLACE FUNCTION incrementar_veces_juntos(
  p_turno TEXT,
  p_a INT,
  p_b INT
)
RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE redoblonas_ciudad_coocurrencia
  SET veces_juntos = veces_juntos + 1,
      actualizado_en = NOW()
  WHERE turno = p_turno
    AND numero_a = LEAST(p_a, p_b)
    AND numero_b = GREATEST(p_a, p_b);
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- INSTRUCCIONES:
-- 1. Ve a https://app.supabase.com → Tu proyecto → SQL Editor
-- 2. Copia y pega TODO este archivo
-- 3. Haz clic en "Run"
-- 4. Luego ejecuta: node scripts/backfill-analisis.js
-- ─────────────────────────────────────────────────────────────
