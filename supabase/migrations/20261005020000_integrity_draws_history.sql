-- ============================================================================
-- Auditoría fase P0 — Integridad de datos (2026-10-05)
-- Constraints candidatos, TODOS pre-chequeados contra producción sin violaciones:
--   1574 draws: cardinalidad<>20 → 0 | rango fuera de 0-9999 → 0 |
--   turno fuera de lista → 0 | game_id NULL → 0 | fecha NULL → 0
--   prediction_history: unique(prediction_id) YA existe (0 duplicados) → solo se versiona.
-- Ninguna sentencia destructiva.
-- ============================================================================

-- Forma canónica de un sorteo: exactamente 20 números enteros 0000-9999.
-- (Función inmutable para poder expresar la validación por elemento dentro de un
-- CHECK — PostgreSQL no permite subconsultas/SRFs directos en constraints.)
CREATE OR REPLACE FUNCTION public.draw_numbers_valid(nums integer[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT nums IS NOT NULL
     AND cardinality(nums) = 20
     AND NOT EXISTS (
       SELECT 1
       FROM unnest(nums) AS x
       WHERE x IS NULL OR x < 0 OR x > 9999
     );
$$;

DO $$
BEGIN
  -- C1: forma del sorteo (20 números, rango válido).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.draws'::regclass AND conname = 'draws_numbers_shape'
  ) THEN
    ALTER TABLE public.draws
      ADD CONSTRAINT draws_numbers_shape CHECK (public.draw_numbers_valid(numbers));
  END IF;

  -- C2: dominio canónico de turnos (incluye Poceada).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.draws'::regclass AND conname = 'draws_turno_canonico'
  ) THEN
    ALTER TABLE public.draws
      ADD CONSTRAINT draws_turno_canonico
      CHECK (turno IN ('Previa', 'Primera', 'Matutina', 'Vespertina', 'Nocturna', 'Poceada'));
  END IF;
END $$;

-- C3: game_id obligatorio (0 nulos verificados; upsert_draw siempre lo provee
-- con DEFAULT del juego Nacional o explícito para Poceada).
ALTER TABLE public.draws ALTER COLUMN game_id SET NOT NULL;

-- C4: prediction_history es la base del exactly-once de la verificación
-- (todos los upserts usan ON CONFLICT (prediction_id)). En producción el índice
-- único existe (creado fuera de migraciones, 0 duplicados, 113 filas) — aquí se
-- versiona para que una BD nueva lo obtenga. Si aparecieran duplicados, la
-- migración falla con mensaje explícito en lugar de crearlos silenciosamente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'prediction_history'
      AND indexname = 'prediction_history_prediction_id_unique'
  ) THEN
    IF EXISTS (
      SELECT 1 FROM public.prediction_history
      GROUP BY prediction_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION
        'prediction_history tiene prediction_id duplicados: limpiar antes de imponer unicidad';
    END IF;

    CREATE UNIQUE INDEX prediction_history_prediction_id_unique
      ON public.prediction_history (prediction_id);
  END IF;
END $$;
