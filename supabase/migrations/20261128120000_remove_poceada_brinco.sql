-- ============================================================================
-- Refactor FREE: eliminación completa de Poceada y Brinco (capa de datos).
-- Idempotente. NO toca datos de Quiniela / redoblonas / usuarios / pagos.
-- (Ejecutado y verificado en producción el 2026-11-28; filas y tablas
--  poceada/brinco ya habían sido eliminadas con respaldo previo.)
-- ============================================================================

-- 1. Funciones RPC exclusivas de Poceada Federal / Brinco.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'get_estadisticas_poceada_federal',
        'get_frecuencia_poceada_federal',
        'get_estadisticas_brinco',
        'insertar_poceada_federal_analisis',
        'insertar_brinco_analisis'
      )
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', r.sig);
  END LOOP;
END $do$;

-- 2. calculate_omega_v6 / score_numbers_v6: rama de jurisdicción Poceada →
--    siempre 'CABA' (los turnos válidos son sólo los 5 de la Quiniela).
DO $do$
DECLARE r record; v text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('calculate_omega_v6', 'score_numbers_v6')
  LOOP
    SELECT pg_get_functiondef(r.oid) INTO v;
    v := replace(
      v,
      $$CASE WHEN p_turno = 'Poceada' THEN ARRAY['ciudad']::TEXT[] ELSE ARRAY['CABA']::TEXT[] END$$,
      $$ARRAY['CABA']::TEXT[]$$
    );
    EXECUTE v;
  END LOOP;
END $do$;

-- 3. Restringir constraints a los 5 turnos oficiales y a la única fuente viva.
--    (draws: sólo quedan filas de los 5 turnos; sorteos_embeddings: vacía.)
ALTER TABLE public.draws DROP CONSTRAINT IF EXISTS draws_turno_canonico;
ALTER TABLE public.draws ADD CONSTRAINT draws_turno_canonico
  CHECK (turno IN ('Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna'));

ALTER TABLE public.sorteos_embeddings DROP CONSTRAINT IF EXISTS sorteos_embeddings_fuente_check;
ALTER TABLE public.sorteos_embeddings ADD CONSTRAINT sorteos_embeddings_fuente_check
  CHECK (fuente IN ('quiniela-ciudad'));
