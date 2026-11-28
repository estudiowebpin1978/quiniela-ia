-- ─────────────────────────────────────────────────────────────
-- Migración 005: Tabla de embeddings para búsqueda semántica de sorteos
-- Usa pgvector para encontrar sorteos similares históricamente
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sorteos_embeddings (
  id BIGSERIAL PRIMARY KEY,
  fuente TEXT NOT NULL CHECK (fuente IN ('quiniela-ciudad')),
  fecha DATE NOT NULL,
  turno TEXT,
  numeros_json JSONB NOT NULL, -- los números del sorteo
  embedding vector(384) NOT NULL, -- dimensión de bge-m3 / all-MiniLM-L6-v2
  metadata JSONB DEFAULT '{}',
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(fuente, fecha, turno)
);

CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_fuente ON sorteos_embeddings(fuente);
CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_fecha ON sorteos_embeddings(fecha);
CREATE INDEX IF NOT EXISTS idx_sorteos_embeddings_vector ON sorteos_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

COMMENT ON TABLE sorteos_embeddings IS 'Embeddings de sorteos para búsqueda semántica de sorteos similares';
COMMENT ON COLUMN sorteos_embeddings.embedding IS 'Vector de 384 dimensiones generado con modelo de embeddings';
