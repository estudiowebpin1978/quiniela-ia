-- Fix: cron-precompute pasaba p_model_consistency + p_confidence_type que no
-- existen en la firma (PGRST202 "could not choose the best candidate
-- function") → TODO upsert de cron-precompute fallaba y tiraba la corrida
-- antes del bloque OMEGA (por eso omega_promotion_audit está congelado).
--
-- Además: la columna confidence guardaba NULL/0 porque cron-run pasaba
-- p_confidence: null con agreement_score hardcodeado 0.8.
--
-- Solución: persistir la consistencia del modelo en la columna existente
-- `confidence` (semántica: consistencia, NO probabilidad de acierto; el tipo
-- es fijo en código: "model_consistency") y añadir la columna monte_carlo
-- para la simulación sembrada (bootstrap) del top-10.

ALTER TABLE public.predictions_cache ADD COLUMN IF NOT EXISTS monte_carlo JSONB;

-- Eliminar la firma vieja (15 args) para evitar ambigüedad de PostgREST
DROP FUNCTION IF EXISTS api.predictions_cache_upsert(
  uuid, date, text, jsonb, jsonb, jsonb, jsonb,
  text, double precision, double precision, double precision,
  double precision, double precision, timestamptz, timestamptz
);

CREATE OR REPLACE FUNCTION api.predictions_cache_upsert(
  p_game_id uuid,
  p_date date,
  p_turno text,
  p_numeros_2 jsonb,
  p_numeros_3 jsonb DEFAULT NULL,
  p_numeros_4 jsonb DEFAULT NULL,
  p_redoblona jsonb DEFAULT NULL,
  p_engine_version text DEFAULT 'meta-ensemble-v1',
  p_v6_weight double precision DEFAULT 0.40,
  p_v7_weight double precision DEFAULT 0.35,
  p_ml_weight double precision DEFAULT 0.25,
  p_confidence double precision DEFAULT 0,
  p_agreement_score double precision DEFAULT 0,
  p_computed_at timestamptz DEFAULT now(),
  p_updated_at timestamptz DEFAULT now(),
  p_monte_carlo jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  INSERT INTO public.predictions_cache (
    game_id, date, turno, numeros_2, numeros_3, numeros_4, redoblona,
    engine_version, v6_weight, v7_weight, ml_weight,
    confidence, agreement_score, computed_at, updated_at, monte_carlo
  ) VALUES (
    p_game_id, p_date, p_turno, p_numeros_2, p_numeros_3, p_numeros_4, p_redoblona,
    p_engine_version, p_v6_weight, p_v7_weight, p_ml_weight,
    p_confidence, p_agreement_score, p_computed_at, p_updated_at, p_monte_carlo
  )
  ON CONFLICT (game_id, date, turno)
  DO UPDATE SET
    numeros_2 = EXCLUDED.numeros_2,
    numeros_3 = EXCLUDED.numeros_3,
    numeros_4 = EXCLUDED.numeros_4,
    redoblona = EXCLUDED.redoblona,
    engine_version = EXCLUDED.engine_version,
    v6_weight = EXCLUDED.v6_weight,
    v7_weight = EXCLUDED.v7_weight,
    ml_weight = EXCLUDED.ml_weight,
    confidence = EXCLUDED.confidence,
    agreement_score = EXCLUDED.agreement_score,
    computed_at = EXCLUDED.computed_at,
    updated_at = EXCLUDED.updated_at,
    monte_carlo = EXCLUDED.monte_carlo;
END;
$function$;

GRANT EXECUTE ON FUNCTION api.predictions_cache_upsert(
  uuid, date, text, jsonb, jsonb, jsonb, jsonb,
  text, double precision, double precision, double precision,
  double precision, double precision, timestamptz, timestamptz, jsonb
) TO service_role;

-- Recrear la vista api (añade jurisdiccion que faltaba + monte_carlo al final)
CREATE OR REPLACE VIEW api.predictions_cache AS
SELECT id, game_id, date, turno, numeros_2, numeros_3, numeros_4, redoblona,
       engine_version, v6_weight, v7_weight, ml_weight, confidence,
       agreement_score, factor_attribution, computed_at, updated_at,
       jurisdiccion, monte_carlo
FROM public.predictions_cache;
