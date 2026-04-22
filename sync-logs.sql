-- Tabla de logging para sincronizaciones
CREATE TABLE IF NOT EXISTS sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_date TIMESTAMPTZ DEFAULT now(),
  source TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  records_inserted INTEGER DEFAULT 0,
  error_message TEXT,
  execution_time_ms INTEGER,
  metadata JSONB
);

-- Índice para búsquedas rápidas
CREATE INDEX IF NOT EXISTS idx_sync_logs_date ON sync_logs(sync_date DESC);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);

-- Comments
COMMENT ON TABLE sync_logs IS 'Logs de sincronización de sorteos';
COMMENT ON COLUMN sync_logs.sync_date IS 'Fecha de ejecución del sync';
COMMENT ON COLUMN sync_logs.source IS 'Fuente de los datos (scraper, manual, etc)';
COMMENT ON COLUMN sync_logs.status IS 'Estado: success, failed, o skipped';
COMMENT ON COLUMN sync_logs.records_inserted IS 'Cantidad de registros insertados';
COMMENT ON COLUMN sync_logs.error_message IS 'Mensaje de error si falló';
COMMENT ON COLUMN sync_logs.execution_time_ms IS 'Tiempo de ejecución en milisegundos';
COMMENT ON COLUMN sync_logs.metadata IS 'Datos adicionales en JSON';