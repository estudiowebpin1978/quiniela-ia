-- ============================================================
-- schema.sql  -  Quiniela IA
-- Supabase proyecto: wazkylxgqckjfkcmfotl
-- Ejecutar en: Supabase > SQL Editor
-- ============================================================

-- ─── TABLA DRAWS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.draws (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE        NOT NULL,
  turno       TEXT        NOT NULL
              CHECK (turno IN ('previa','primera','matutina','vespertina','nocturna')),
  numbers     INTEGER[]   NOT NULL,
  source      TEXT        DEFAULT 'scraper_quinieleando',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_draws_date_turno
  ON public.draws (date, turno);

CREATE INDEX IF NOT EXISTS idx_draws_numbers
  ON public.draws USING GIN (numbers);

-- ─── TABLA SYNC_LOGS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_date        TIMESTAMPTZ DEFAULT now(),
  source           TEXT        NOT NULL,
  status           TEXT        NOT NULL CHECK (status IN ('success','failed','skipped')),
  records_inserted INTEGER     DEFAULT 0,
  error_message    TEXT,
  execution_time_ms INTEGER,
  metadata         JSONB
);

-- ─── VISTAS ESTADÍSTICAS ─────────────────────────────────

-- 1. Frecuencia en CABEZA (posición 1)
CREATE OR REPLACE VIEW public.v_frecuencia_cabeza AS
SELECT
  LPAD((numbers[1] % 100)::text, 2, '0') AS terminacion,
  turno,
  COUNT(*) AS apariciones,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (PARTITION BY turno), 2) AS pct
FROM public.draws
WHERE array_length(numbers, 1) >= 1
GROUP BY 1, 2
ORDER BY turno, apariciones DESC;

-- 2. Frecuencia en CUALQUIER posición (1-20)
CREATE OR REPLACE VIEW public.v_frecuencia_general AS
SELECT
  LPAD((num % 100)::text, 2, '0') AS terminacion,
  turno,
  COUNT(*) AS apariciones
FROM public.draws, UNNEST(numbers) AS num
GROUP BY 1, 2
ORDER BY turno, apariciones DESC;

-- 3. Números más ATRASADOS en cabeza
CREATE OR REPLACE VIEW public.v_numeros_atrasados AS
WITH ultima AS (
  SELECT
    LPAD((numbers[1] % 100)::text, 2, '0') AS terminacion,
    turno,
    MAX(date) AS ultima_fecha
  FROM public.draws
  WHERE array_length(numbers, 1) >= 1
  GROUP BY 1, 2
)
SELECT
  terminacion,
  turno,
  ultima_fecha,
  (CURRENT_DATE - ultima_fecha) AS dias_atrasado
FROM ultima
ORDER BY turno, dias_atrasado DESC;

-- 4. COBERTURA diaria
CREATE OR REPLACE VIEW public.v_cobertura_diaria AS
SELECT
  date,
  TO_CHAR(date, 'Day') AS dia_semana,
  COUNT(DISTINCT turno) AS turnos_presentes,
  STRING_AGG(turno, ', ' ORDER BY turno) AS turnos
FROM public.draws
GROUP BY date
ORDER BY date DESC;

-- 5. STATS por turno
CREATE OR REPLACE VIEW public.v_stats_por_turno AS
SELECT
  turno,
  COUNT(*) AS total_sorteos,
  MIN(date) AS desde,
  MAX(date) AS hasta,
  COUNT(DISTINCT date) AS dias_con_datos
FROM public.draws
GROUP BY turno
ORDER BY turno;
