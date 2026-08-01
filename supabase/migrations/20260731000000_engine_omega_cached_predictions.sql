-- ============================================================
-- MIGRATION: Engine Omega — Cached Predictions + RPCs + Triggers
-- Date: 2026-07-31
-- Description: Moves all prediction math to PostgreSQL RPCs.
--   1. cached_predictions table (pre-calculated per turno)
--   2. calcular_prediccion_maestra() — 4-factor ensemble RPC
--   3. calcular_redoblona_premium() — co-occurrence matrix RPC
--   4. trigger_refresh_predictions — auto-recalc after draw insert
--   5. auto_verify_saved_predictions — auto-check on draw insert
-- ============================================================

-- ── 0. Add missing columns to user_predictions ──────────────
DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS redoblona INTEGER[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS aciertos INTEGER[];
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS redoblona_hit BOOLEAN DEFAULT FALSE;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE user_predictions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── 1. cached_predictions table ─────────────────────────────
-- Stores the pre-calculated Top 10 for each turno.
-- Updated automatically by trigger after each draw insert.
CREATE TABLE IF NOT EXISTS cached_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  turno TEXT NOT NULL,
  prediction_date DATE NOT NULL,
  numeros JSONB NOT NULL,          -- [{numero, puntaje_total, desglose_calor, desglose_demora, desglose_turno, desglose_markov}]
  redoblona JSONB,                 -- {cabeza, acompanantes: [{numero, frecuencia, probabilidad}]}
  total_sorteos_analizados INT NOT NULL DEFAULT 0,
  calculated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(turno, prediction_date)
);
CREATE INDEX IF NOT EXISTS idx_cached_pred_turno_date ON cached_predictions (turno, prediction_date DESC);

-- ── 2. RPC: calcular_prediccion_maestra ─────────────────────
-- 4-factor ensemble: Calor (25%) + Demora (35%) + Afinidad Turno (20%) + Markov (20%)
-- Adapta tabla draws (numbers INTEGER[]) en vez de columnas separadas.
CREATE OR REPLACE FUNCTION calcular_prediccion_maestra(turno_objetivo TEXT)
RETURNS TABLE (
  numero INT,
  puntaje_total NUMERIC,
  desglose_calor NUMERIC,
  desglose_demora NUMERIC,
  desglose_turno NUMERIC,
  desglose_markov NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_sorteos INT;
  ultimo_numero_cabeza INT;
BEGIN
  -- Total de sorteos en la tabla
  SELECT COUNT(*) INTO total_sorteos FROM draws;

  -- Último número a la cabeza (numbers[1] = primer premio) para Markov
  SELECT MOD(numbers[1], 100) INTO ultimo_numero_cabeza
  FROM draws
  ORDER BY date DESC, created_at DESC
  LIMIT 1;

  RETURN QUERY
  WITH base_numeros AS (
    SELECT num AS n FROM generate_series(0, 99) num
  ),

  -- FACTOR 1: Calor (Frecuencia en los últimos 100 sorteos de ESTE turno)
  frecuencia_reciente AS (
    SELECT
      MOD(d.numbers[1], 100) AS n,
      COUNT(*) AS apariciones
    FROM (
      SELECT numbers FROM draws
      WHERE turno = turno_objetivo
      ORDER BY date DESC, created_at DESC
      LIMIT 100
    ) d
    GROUP BY n
  ),
  max_apariciones AS (
    SELECT COALESCE(MAX(apariciones), 1)::NUMERIC AS max_ap FROM frecuencia_reciente
  ),

  -- FACTOR 2: Tensión / Demora (cuántos sorteos hace que no sale)
  numbered_draws AS (
    SELECT
      MOD(numbers[1], 100) AS n,
      ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws
    WHERE turno = turno_objetivo
  ),
  demoras AS (
    SELECT n, (MIN(rn) - 1)::NUMERIC AS atraso
    FROM numbered_draws
    GROUP BY n
  ),
  max_demora AS (
    SELECT COALESCE(MAX(atraso), 1)::NUMERIC AS max_atraso FROM demoras
  ),

  -- FACTOR 3: Afinidad de Turno (histórico total de este turno)
  afinidad AS (
    SELECT
      MOD(numbers[1], 100) AS n,
      COUNT(*) AS veces_en_turno
    FROM draws
    WHERE turno = turno_objetivo
    GROUP BY n
  ),
  max_afinidad AS (
    SELECT COALESCE(MAX(veces_en_turno), 1)::NUMERIC AS max_af FROM afinidad
  ),

  -- FACTOR 4: Markov 1er Orden (qué números salen DESPUÉS del último número sorteado)
  markov AS (
    SELECT
      MOD(d_next.numbers[1], 100) AS n,
      COUNT(*) AS transiciones
    FROM draws d_prev
    JOIN draws d_next
      ON (d_next.date > d_prev.date OR (d_next.date = d_prev.date AND d_next.created_at > d_prev.created_at))
      AND d_next.turno = d_prev.turno
    WHERE d_prev.turno = turno_objetivo
      AND MOD(d_prev.numbers[1], 100) = ultimo_numero_cabeza
    GROUP BY MOD(d_next.numbers[1], 100)
  ),
  max_markov AS (
    SELECT COALESCE(MAX(transiciones), 1)::NUMERIC AS max_tr FROM markov
  )

  -- ENSAMBLE FINAL: ponderación matemática
  SELECT
    bn.n AS numero,
    (
      COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * 25, 0) +
      COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * 35, 0) +
      COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * 20, 0) +
      COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * 20, 0)
    )::NUMERIC(7,3) AS puntaje_total,

    COALESCE((fr.apariciones::NUMERIC / (SELECT max_ap FROM max_apariciones)) * 100, 0)::NUMERIC(5,2) AS desglose_calor,
    COALESCE((dm.atraso / (SELECT max_atraso FROM max_demora)) * 100, 0)::NUMERIC(5,2) AS desglose_demora,
    COALESCE((af.veces_en_turno::NUMERIC / (SELECT max_af FROM max_afinidad)) * 100, 0)::NUMERIC(5,2) AS desglose_turno,
    COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * 100, 0)::NUMERIC(5,2) AS desglose_markov

  FROM base_numeros bn
  LEFT JOIN frecuencia_reciente fr ON bn.n = fr.n
  LEFT JOIN demoras dm ON bn.n = dm.n
  LEFT JOIN afinidad af ON bn.n = af.n
  LEFT JOIN markov mk ON bn.n = mk.n
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── 3. RPC: calcular_redoblona_premium ──────────────────────
-- Co-occurrence matrix: dado un número cabeza, qué acompañantes
-- aparecen con más frecuencia en la misma pizarra.
CREATE OR REPLACE FUNCTION calcular_redoblona_premium(numero_cabeza INT, turno_objetivo TEXT)
RETURNS TABLE (
  numero_acompanante INT,
  frecuencia_coocurrencia INT,
  probabilidad_porcentaje NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_apariciones_cabeza INT;
BEGIN
  -- Contar cuántas veces el número cabeza salió en este turno
  SELECT COUNT(*) INTO total_apariciones_cabeza
  FROM draws
  WHERE turno = turno_objetivo
    AND MOD(numbers[1], 100) = numero_cabeza;

  RETURN QUERY
  WITH sorteos_cabeza AS (
    SELECT numbers
    FROM draws
    WHERE turno = turno_objetivo
      AND MOD(numbers[1], 100) = numero_cabeza
  ),
  premios_raw AS (
    SELECT unnest(numbers[2:20]) AS premio
    FROM sorteos_cabeza
  ),
  premios_secundarios AS (
    SELECT MOD(premio, 100) AS n
    FROM premios_raw
    WHERE premio IS NOT NULL
  )
  SELECT
    ps.n AS numero_acompanante,
    COUNT(*)::INT AS frecuencia_coocurrencia,
    ROUND(
      (COUNT(*)::NUMERIC / NULLIF(total_apariciones_cabeza, 0)) * 100,
      2
    ) AS probabilidad_porcentaje
  FROM premios_secundarios ps
  WHERE ps.n != numero_cabeza
  GROUP BY ps.n
  ORDER BY frecuencia_coocurrencia DESC
  LIMIT 3;
END;
$$;

-- ── 4. RPC: refresh_cached_predictions ──────────────────────
-- Recalcula y guarda las predicciones cacheadas para un turno.
CREATE OR REPLACE FUNCTION refresh_cached_predictions(turno_objetivo TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  pred_date DATE;
  top10 JSONB;
  redoblona_data JSONB;
  cabeza_num INT;
  total_draws INT;
  redoblona_res RECORD;
BEGIN
  -- Fecha de predicción = hoy en Argentina
  pred_date := CURRENT_DATE;

  -- Obtener total de sorteos
  SELECT COUNT(*) INTO total_draws FROM draws WHERE turno = turno_objetivo;

  -- Calcular Top 10
  SELECT jsonb_agg(row_to_json(t))
  INTO top10
  FROM (
    SELECT * FROM calcular_prediccion_maestra(turno_objetivo)
  ) t;

  -- Si hay resultados, calcular redoblona con el #1
  IF top10 IS NOT NULL AND jsonb_array_length(top10) > 0 THEN
    cabeza_num := (top10->0->>'numero')::INT;

    -- Calcular redoblona
    SELECT jsonb_build_object(
      'cabeza', cabeza_num,
      'acompanantes', (
        SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::JSONB)
        FROM (
          SELECT * FROM calcular_redoblona_premium(cabeza_num, turno_objetivo)
        ) r
      )
    ) INTO redoblona_res;

    redoblona_data := row_to_json(redoblona_res)::JSONB;
  ELSE
    redoblona_data := NULL;
  END IF;

  -- UPSERT en cached_predictions
  INSERT INTO cached_predictions (turno, prediction_date, numeros, redoblona, total_sorteos_analizados, calculated_at)
  VALUES (turno_objetivo, pred_date, COALESCE(top10, '[]'::JSONB), redoblona_data, total_draws, now())
  ON CONFLICT (turno, prediction_date)
  DO UPDATE SET
    numeros = EXCLUDED.numeros,
    redoblona = EXCLUDED.redoblona,
    total_sorteos_analizados = EXCLUDED.total_sorteos_analizados,
    calculated_at = now();
END;
$$;

-- ── 5. Trigger: auto-refresh after draw insert ──────────────
-- Cuando se inserta un sorteo nuevo, recalcula predicciones para ese turno.
CREATE OR REPLACE FUNCTION trigger_refresh_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Recalcular predicciones para el turno del sorteo nuevo
  PERFORM refresh_cached_predictions(NEW.turno);

  -- También recalcula para el turno anterior (por si cambia el Markov)
  IF NEW.turno = 'Primera' THEN
    PERFORM refresh_cached_predictions('Previa');
  ELSIF NEW.turno = 'Matutina' THEN
    PERFORM refresh_cached_predictions('Primera');
  ELSIF NEW.turno = 'Vespertina' THEN
    PERFORM refresh_cached_predictions('Matutina');
  ELSIF NEW.turno = 'Nocturna' THEN
    PERFORM refresh_cached_predictions('Vespertina');
  ELSIF NEW.turno = 'Previa' THEN
    PERFORM refresh_cached_predictions('Nocturna');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_predictions ON draws;
CREATE TRIGGER trg_refresh_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_predictions();

-- ── 6. Trigger: auto-verify saved predictions ───────────────
-- Cuando se inserta un sorteo, verifica automáticamente las predicciones guardadas.
CREATE OR REPLACE FUNCTION auto_verify_saved_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pred RECORD;
  drawn_numbers INT[];
  aciertos_2 INT[];
  aciertos_3 INT[];
  aciertos_4 INT[];
  redoblona_hit BOOLEAN;
BEGIN
  drawn_numbers := NEW.numbers;

  -- Buscar predicciones pendientes para este turno y fecha
  FOR pred IN
    SELECT * FROM user_predictions
    WHERE turno = NEW.turno
      AND date = NEW.date
      AND status = 'pending'
  LOOP
    aciertos_2 := ARRAY(
      SELECT unnest(pred.numbers)
      INTERSECT
      SELECT unnest(drawn_numbers)
    );

    redoblona_hit := FALSE;
    IF pred.redoblona IS NOT NULL THEN
      redoblona_hit := pred.redoblona <@ drawn_numbers;
    END IF;

    -- Determinar estado
    IF array_length(aciertos_2, 1) > 0 THEN
      UPDATE user_predictions
      SET
        status = 'won',
        aciertos = aciertos_2,
        redoblona_hit = redoblona_hit,
        verified_at = now(),
        updated_at = now()
      WHERE id = pred.id;
    ELSE
      UPDATE user_predictions
      SET
        status = 'lost',
        aciertos = ARRAY[]::INT[],
        redoblona_hit = FALSE,
        verified_at = now(),
        updated_at = now()
      WHERE id = pred.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_verify ON draws;
CREATE TRIGGER trg_auto_verify
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION auto_verify_saved_predictions();

-- ── 7. Backfill: calcular predicciones iniciales para todos los turnos ──
SELECT refresh_cached_predictions('Previa');
SELECT refresh_cached_predictions('Primera');
SELECT refresh_cached_predictions('Matutina');
SELECT refresh_cached_predictions('Vespertina');
SELECT refresh_cached_predictions('Nocturna');
