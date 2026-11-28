-- ─────────────────────────────────────────────────────────────
-- Migración 002: Tabla de co-ocurrencia de redoblonas por turno
-- Quiniela de la Ciudad (LOTBA) - Solo CABA
-- ─────────────────────────────────────────────────────────────

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

-- Trigger para actualizar actualizado_en automáticamente
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

-- Comentarios
COMMENT ON TABLE redoblonas_ciudad_coocurrencia IS 'Co-ocurrencia de pares (redoblonas) por turno en Quiniela Ciudad';
COMMENT ON COLUMN redoblonas_ciudad_coocurrencia.veces_juntos IS 'Cuántas veces salieron juntos número_a y número_b en ese turno';
COMMENT ON COLUMN redoblonas_ciudad_coocurrencia.gap_promedio IS 'Promedio de sorteos entre apariciones del par';
