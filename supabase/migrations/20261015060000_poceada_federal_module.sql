-- ============================================================================
-- Módulo: POCEADA FEDERAL (Santa Fe / IAFAS) — tablas INDEPENDIENTES.
-- Aditivo e idempotente (IF NOT EXISTS / ON CONFLICT DO NOTHING).
-- NO toca draws, user_predictions, prediction_history, brinco_* ni OMEGA V6.
--
-- Fuentes oficiales verificadas (2026-10-14/15):
--   1) Lotería de Santa Fe — apps.loteriasantafe.gov.ar:8443/Extractos/
--      paginas/mostrarPoceadaFederal.xhtml (extracto HTML con 20 números,
--      concurso, mes/sorteo seleccionados, tabla de premios y PDF por sorteo).
--   2) IAFAS — servicios.iafas.gov.ar/ServicioExtracto (listado oficial de
--      sorteos, Modalidad 30) y /serviciopdf/Extractos/pdfpoceada (PDF oficial
--      por sorteo). Historial disponible desde 2021-06-22.
--
-- Estados de validación: pending | validated | conflict | failed
-- Escrituras SOLO server-side (service_role). RLS habilitada sin política
-- pública: las lecturas públicas pasan por app/api/poceada-federal/*.
--
-- ROLLBACK (manual, destructivo sólo si se decide revertir):
--   DROP TABLE IF EXISTS poceada_federal_predictions;
--   DROP TABLE IF EXISTS poceada_federal_incidents;
--   DROP TABLE IF EXISTS poceada_federal_draws;
--   DROP FUNCTION IF EXISTS poceada_federal_extracto_valido(int[]);
-- ============================================================================

-- 1. Validador inmutable de extracto: exactamente 20 números enteros 00-99
--    sin repetidos (reglas oficiales del extracto final de Poceada Federal).
CREATE OR REPLACE FUNCTION poceada_federal_extracto_valido(numeros integer[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT array_length(numeros, 1) = 20
     AND NOT EXISTS (
       SELECT 1 FROM unnest(numeros) n WHERE n < 0 OR n > 99
     )
     AND (SELECT count(DISTINCT n) FROM unnest(numeros) n) = 20;
$$;

-- 2. Sorteos oficiales (una fila por concurso oficial).
CREATE TABLE IF NOT EXISTS poceada_federal_draws (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concurso         integer NOT NULL UNIQUE,
  fecha            date NOT NULL,
  hora             text,
  numeros          integer[] NOT NULL
                     CONSTRAINT draws_extracto_20_chk
                       CHECK (poceada_federal_extracto_valido(numeros)),
  fuente           text NOT NULL,
  fuentes          text[] NOT NULL DEFAULT '{}',
  url_extracto     text,
  pdf_url          text,
  corroborado      boolean NOT NULL DEFAULT false,
  estado           text NOT NULL DEFAULT 'pending'
                     CONSTRAINT draws_estado_chk
                       CHECK (estado IN ('pending','validated','conflict','failed')),
  estado_detalle   text,
  contenido_hash   text NOT NULL,
  publicado_en     timestamptz,
  consultado_en    timestamptz NOT NULL DEFAULT now(),
  verificado_en    timestamptz,
  importado_en     timestamptz NOT NULL DEFAULT now(),
  metadatos        jsonb NOT NULL DEFAULT '{}'::jsonb
);
COMMENT ON TABLE poceada_federal_draws IS
  'Extractos oficiales de Poceada Federal (20 números 00-99 por concurso).';

CREATE INDEX IF NOT EXISTS draws_fecha_idx
  ON poceada_federal_draws (fecha DESC);
CREATE INDEX IF NOT EXISTS draws_estado_idx
  ON poceada_federal_draws (estado);
CREATE INDEX IF NOT EXISTS draws_hash_idx
  ON poceada_federal_draws (contenido_hash);

-- 3. Incidentes de auditoría (validaciones fallidas y contradicciones).
CREATE TABLE IF NOT EXISTS poceada_federal_incidents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concurso    integer,
  tipo        text NOT NULL,
  detalle     jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE poceada_federal_incidents IS
  'Auditoría de intentos fallidos/conflictos del módulo Poceada Federal.';

CREATE INDEX IF NOT EXISTS incidents_concurso_idx
  ON poceada_federal_incidents (concurso);

-- 4. Predicciones registradas ANTES del sorteo (append-only, auditable).
--    NO reutiliza mis-predicciones: Poceada Federal no tiene turnos de Quiniela.
CREATE TABLE IF NOT EXISTS poceada_federal_predictions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sorteo_objetivo_concurso integer,
  sorteo_objetivo_confirmado boolean NOT NULL DEFAULT false,
  generado_en             timestamptz NOT NULL DEFAULT now(),
  historial_corte_fecha   date NOT NULL,
  historial_corte_concurso integer NOT NULL,
  entrenamiento_count     integer NOT NULL,
  historial_huella        text NOT NULL,
  algoritmo_version       text NOT NULL,
  combinaciones           jsonb NOT NULL
                            CONSTRAINT preds_5_combos_chk
                              CHECK (jsonb_array_length(combinaciones) = 5),
  estado                  text NOT NULL DEFAULT 'pendiente'
                            CONSTRAINT preds_estado_chk
                              CHECK (estado IN ('pendiente','evaluada','no_evaluable')),
  evaluacion_draw_id      uuid REFERENCES poceada_federal_draws(id),
  evaluacion              jsonb,
  creado_en               timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE poceada_federal_predictions IS
  'Instantáneas de las 5 combinaciones generadas, registradas antes del sorteo.';

CREATE INDEX IF NOT EXISTS preds_generado_idx
  ON poceada_federal_predictions (generado_en DESC);
CREATE INDEX IF NOT EXISTS preds_objetivo_idx
  ON poceada_federal_predictions (sorteo_objetivo_concurso);

-- 5. RLS: habilitada; sin política para anon/authenticated (sólo service_role,
--    igual patrón que brinco_*). Las lecturas públicas van por la API propia.
ALTER TABLE poceada_federal_draws       ENABLE ROW LEVEL SECURITY;
ALTER TABLE poceada_federal_incidents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE poceada_federal_predictions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'poceada_federal_draws'
                   AND policyname = 'service_role_draws_all') THEN
    CREATE POLICY service_role_draws_all ON poceada_federal_draws
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'poceada_federal_incidents'
                   AND policyname = 'service_role_incidents_all') THEN
    CREATE POLICY service_role_incidents_all ON poceada_federal_incidents
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'poceada_federal_predictions'
                   AND policyname = 'service_role_predictions_all') THEN
    CREATE POLICY service_role_predictions_all ON poceada_federal_predictions
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON poceada_federal_draws       FROM anon, authenticated;
REVOKE ALL ON poceada_federal_incidents   FROM anon, authenticated;
REVOKE ALL ON poceada_federal_predictions FROM anon, authenticated;
