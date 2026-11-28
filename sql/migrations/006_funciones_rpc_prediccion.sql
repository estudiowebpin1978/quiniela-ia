-- ─────────────────────────────────────────────────────────────
-- Funciones RPC para motor de predicción Quiniela IA
-- Ejecutar en Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────

-- ─── 1. Números atrasados por turno (para redoblonas) ───────
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
LANGUAGE sql STABLE AS $$
  WITH ultimas_apariciones AS (
    SELECT
      (n % 100) AS numero,
      MAX(date) AS ultima_fecha
    FROM draws
    WHERE turno = p_turno
      AND jurisdiccion = 'CABA'
    GROUP BY (n % 100)
  ),
  total_sorteos AS (
    SELECT COUNT(DISTINCT date) AS total, MAX(date) AS ultima_fecha_global
    FROM draws
    WHERE turno = p_turno
      AND jurisdiccion = 'CABA'
  ),
  ordenamiento AS (
    SELECT DISTINCT date
    FROM draws
    WHERE turno = p_turno
      AND jurisdiccion = 'CABA'
    ORDER BY date ASC
  ),
  posiciones AS (
    SELECT date, ROW_NUMBER() OVER (ORDER BY date ASC) AS pos
    FROM ordenamiento
  ),
  atraso_calculado AS (
    SELECT
      ua.numero,
      (SELECT MAX(pos) FROM posiciones) - COALESCE((SELECT pos FROM posiciones WHERE date = ua.ultima_fecha), 0) AS sorteos_sin_salir,
      COUNT(d.n) AS frecuencia,
      p_turno AS turno
    FROM ultimas_apariciones ua
    CROSS JOIN total_sorteos ts
    LEFT JOIN LATERAL (
      SELECT UNNEST(draws.numbers) AS n
      FROM draws
      WHERE draws.turno = p_turno
        AND draws.jurisdiccion = 'CABA'
    ) d ON TRUE
    GROUP BY ua.numero, ua.ultima_fecha
  )
  SELECT
    numero,
    sorteos_sin_salir,
    frecuencia,
    turno
  FROM atraso_calculado
  ORDER BY sorteos_sin_salir DESC
  LIMIT p_limite;
$$;

-- ─── 2. Búsqueda de sorteos similares con pgvector ──────────
-- Requiere que pgvector esté habilitado (extensión vector)
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

-- ─── 8. Insertar co-ocurrencia redoblonas desde sorteo ──────
CREATE OR REPLACE FUNCTION insertar_redoblonas_ciudad_desde_sorteo(
  p_fecha DATE,
  p_turno TEXT,
  p_numeros INTEGER[]
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_a INT;
  v_b INT;
BEGIN
  FOR i IN 1..array_length(p_numeros, 1) LOOP
    FOR j IN i+1..array_length(p_numeros, 1) LOOP
      v_a := LEAST(p_numeros[i] % 100, p_numeros[j] % 100);
      v_b := GREATEST(p_numeros[i] % 100, p_numeros[j] % 100);

      INSERT INTO redoblonas_ciudad_coocurrencia (turno, numero_a, numero_b, veces_juntos, ultima_aparicion)
      VALUES (p_turno, v_a, v_b, 1, p_fecha)
      ON CONFLICT (turno, numero_a, numero_b) DO UPDATE SET
        veces_juntos = redoblonas_ciudad_coocurrencia.veces_juntos + 1,
        ultima_aparicion = EXCLUDED.ultima_aparicion,
        actualizado_en = NOW();
    END LOOP;
  END LOOP;
END;
$$;

-- ─── 9. Incrementar veces_juntos de una redoblona ───────────
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

COMMENT ON FUNCTION incrementar_veces_juntos IS 'Incrementa el contador de co-ocurrencia de una redoblona';
COMMENT ON FUNCTION get_numeros_atrasados_turno IS 'Devuelve números atrasados (overdue) por turno de Quiniela Ciudad';
COMMENT ON FUNCTION buscar_sorteos_similares IS 'Búsqueda semántica de sorteos similares usando pgvector';
COMMENT ON FUNCTION insertar_redoblonas_ciudad_desde_sorteo IS 'Actualiza co-ocurrencia de redoblonas desde un sorteo';
