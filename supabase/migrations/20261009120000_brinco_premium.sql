-- ============================================================================
-- Migración: BRINCO PREMIUM — juego aislado (6 números de 40, universo 00-39)
-- Lotería de Santa Fe (Caja de Acción Social). Juego POCEADO (parimutuel).
--
-- Aislada de la Quiniela: tablas propias (brinco_draws, brinco_predictions).
-- NO toca draws, user_predictions, prediction_history ni OMEGA V6.
-- Idempotente (IF NOT EXISTS / ON CONFLICT). Reversible: ver sección ROLLBACK.
--
-- Fuentes de reglas (2026-10-09):
--   loteriasantafe.gov.ar/brinco-preguntas-frecuentes/  y  /resena-de-juegos/
--   cas.gob.ar/juegos/sorteos/resultados?juego=brinco
-- ============================================================================

-- 1. Juego Brinco en la tabla `games` (fila dedicada, no reutiliza Quiniela).
--    La tabla real exige slug, name, number_count, number_range_min/max.
INSERT INTO games (id, slug, name, number_count, number_range_min, number_range_max)
VALUES ('3f8e2a1b-9c4d-4e6f-8a7b-5c9d1e2f3a4b', 'brinco', 'Brinco (Santa Fe)', 6, 0, 39)
ON CONFLICT DO NOTHING;

-- 2. Función inmutable de validación de combinación (para CHECK constraints).
--    Postgres no permite subconsultas inline en CHECK, pero sí dentro de una
--    función inmutable. Valida: 6 números, universo 0..39, todos distintos.
CREATE OR REPLACE FUNCTION public.brinco_combinacion_valida(nums INTEGER[])
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_length(nums, 1) = 6
     AND nums <@ ARRAY[
       0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,
       20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39
     ]::INTEGER[]
     AND array_length(ARRAY(SELECT DISTINCT unnest(nums)), 1) = 6;
$$;

-- 3. Historial de sorteos.
CREATE TABLE IF NOT EXISTS public.brinco_draws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concurso INTEGER NOT NULL,
  fecha DATE NOT NULL,
  tradicional INTEGER[] NOT NULL,
  junior INTEGER[] NULL,
  -- Período reglamentario del Junior aplicable al concurso.
  reglas_junior TEXT NOT NULL DEFAULT 'junior_siempresale'
    CHECK (reglas_junior IN ('sin_junior','junior_solo_6','junior_siempresale')),
  estado_verificacion TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (estado_verificacion IN ('verified_official','cross_checked','pending_verification','rejected')),
  fuente TEXT NOT NULL DEFAULT 'cas-oficial',
  url TEXT,
  metadatos JSONB NOT NULL DEFAULT '{}'::jsonb,
  importado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ultimo_intento TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verificado_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un concurso y una fecha no pueden repetirse.
  CONSTRAINT brinco_draws_concurso_unico UNIQUE (concurso),
  CONSTRAINT brinco_draws_fecha_unica UNIQUE (fecha),
  -- Combinaciones válidas: 6 números distintos de 0..39.
  CONSTRAINT brinco_draws_tradicional_valida CHECK (public.brinco_combinacion_valida(tradicional)),
  CONSTRAINT brinco_draws_junior_valida CHECK (junior IS NULL OR public.brinco_combinacion_valida(junior))
);

CREATE INDEX IF NOT EXISTS idx_brinco_draws_fecha ON public.brinco_draws (fecha);
CREATE INDEX IF NOT EXISTS idx_brinco_draws_concurso ON public.brinco_draws (concurso);

-- 4. Predicciones de usuarios Premium.
CREATE TABLE IF NOT EXISTS public.brinco_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concurso_objetivo INTEGER NOT NULL,
  fecha_objetivo DATE,
  -- 'tradicional' | 'junior' | 'ambos' (una misma jugada evalúa contra ambos).
  modalidad TEXT NOT NULL DEFAULT 'ambos'
    CHECK (modalidad IN ('tradicional','junior','ambos')),
  numeros INTEGER[] NOT NULL,
  scores JSONB DEFAULT '[]'::jsonb,
  factores JSONB DEFAULT '{}'::jsonb,
  engine_version TEXT NOT NULL DEFAULT 'brinco-ev-antissplit-v1',
  n_historico INTEGER NOT NULL DEFAULT 0,
  datos_hasta DATE,
  estado TEXT NOT NULL DEFAULT 'generada',
  resultado_oficial JSONB DEFAULT NULL,
  aciertos_tradicional INTEGER,
  aciertos_junior INTEGER,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Una jugada por usuario/concurso/modalidad (idempotente).
  CONSTRAINT brinco_predictions_unica UNIQUE (user_id, concurso_objetivo, modalidad),
  CONSTRAINT brinco_predictions_numeros_valida CHECK (public.brinco_combinacion_valida(numeros))
);

CREATE INDEX IF NOT EXISTS idx_brinco_predictions_user
  ON public.brinco_predictions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brinco_predictions_concurso
  ON public.brinco_predictions (concurso_objetivo);

-- 5. RLS: solo service_role escribe/lee. Ningún cliente anon/authenticated
--    accede directamente; la escritura y lectura pasan por el servidor.
ALTER TABLE public.brinco_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brinco_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "brinco_draws_service" ON public.brinco_draws;
CREATE POLICY "brinco_draws_service"
  ON public.brinco_draws FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

DROP POLICY IF EXISTS "brinco_predictions_service" ON public.brinco_predictions;
CREATE POLICY "brinco_predictions_service"
  ON public.brinco_predictions FOR ALL
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- 6. Grants (service_role opera vía server-side).
GRANT ALL ON public.brinco_draws TO service_role;
GRANT ALL ON public.brinco_predictions TO service_role;
GRANT EXECUTE ON FUNCTION public.brinco_combinacion_valida(INTEGER[]) TO service_role;

-- ============================================================================
-- ROLLBACK (manual, si se desea deshacer esta feature sin tocar nada más):
--   DROP TABLE IF EXISTS public.brinco_predictions;
--   DROP TABLE IF EXISTS public.brinco_draws;
--   DROP FUNCTION IF EXISTS public.brinco_combinacion_valida(INTEGER[]);
--   DELETE FROM games WHERE id = '3f8e2a1b-9c4d-4e6f-8a7b-5c9d1e2f3a4b';
-- ============================================================================
