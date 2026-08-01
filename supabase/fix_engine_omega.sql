-- ============================================================
-- FIX COMPLETO: Engine PostgreSQL (Markov + Triggers)
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- ── 1. CORREGIR RPC calcular_prediccion_maestra ──────────────
-- Markov ahora analiza TODAS las transiciones del último número en el turno
CREATE OR REPLACE FUNCTION calcular_prediccion_maestra(turno_objetivo TEXT)
RETURNS TABLE(
  numero INT,
  puntaje_total NUMERIC(7,3),
  desglose_calor NUMERIC(5,2),
  desglose_demora NUMERIC(5,2),
  desglose_turno NUMERIC(5,2),
  desglose_markov NUMERIC(5,2),
  frecuencia_total INT,
  sorteos_sin_aparecer INT,
  veces_en_turno INT,
  transiciones_markov INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ultimo_numero_cabeza INT;
BEGIN
  -- Obtener el último número cabeza sorteado en este turno
  SELECT MOD(numbers[1], 100) INTO ultimo_numero_cabeza
  FROM draws
  WHERE turno = turno_objetivo
  ORDER BY date DESC, created_at DESC
  LIMIT 1;

  RETURN QUERY
  WITH
  -- Todos los números del 00 al 99
  base_numbers AS (
    SELECT generate_series(0, 99) AS n
  ),

  -- FACTOR 1: Calor (frecuencia histórica total)
  frecuencias AS (
    SELECT
      MOD(unnest(numbers[1:20]), 100) AS n,
      COUNT(*) AS apariciones
    FROM draws
    WHERE turno = turno_objetivo
    GROUP BY MOD(unnest(numbers[1:20]), 100)
  ),
  max_apariciones AS (
    SELECT COALESCE(MAX(apariciones), 1)::NUMERIC AS max_ap FROM frecuencias
  ),

  -- FACTOR 2: Demora (cuántos sorteos sin salir)
  ultima_aparicion AS (
    SELECT
      MOD(numbers[1], 100) AS n,
      MAX(date) AS ultima_fecha
    FROM draws
    WHERE turno = turno_objetivo
    GROUP BY MOD(numbers[1], 100)
  ),
  demoras AS (
    SELECT
      bn.n,
      COALESCE(
        (SELECT MAX(date) FROM draws WHERE turno = turno_objetivo) - ua.ultima_fecha,
        999
      ) AS atraso
    FROM base_numbers bn
    LEFT JOIN ultima_aparicion ua ON bn.n = ua.n
  ),
  max_demora AS (
    SELECT COALESCE(MAX(atraso), 1)::NUMERIC AS max_atraso FROM demoras
  ),

  -- FACTOR 3: Afinidad por turno (cuántas veces salió en este turno específico)
  afinidad_turno AS (
    SELECT
      MOD(numbers[1], 100) AS n,
      COUNT(*) AS veces_en_turno
    FROM draws
    WHERE turno = turno_objetivo
    GROUP BY MOD(numbers[1], 100)
  ),
  max_afinidad AS (
    SELECT COALESCE(MAX(veces_en_turno), 1)::NUMERIC AS max_af FROM afinidad_turno
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
    COALESCE((mk.transiciones::NUMERIC / (SELECT max_tr FROM max_markov)) * 100, 0)::NUMERIC(5,2) AS desglose_markov,

    COALESCE(fr.apariciones, 0) AS frecuencia_total,
    COALESCE(
      (SELECT MAX(date) FROM draws WHERE turno = turno_objetivo) - COALESCE(ua.ultima_fecha, '2020-01-01'::DATE),
      999
    )::INT AS sorteos_sin_aparecer,
    COALESCE(af.veces_en_turno, 0) AS veces_en_turno,
    COALESCE(mk.transiciones, 0) AS transiciones_markov

  FROM base_numbers bn
  LEFT JOIN frecuencias fr ON bn.n = fr.n
  LEFT JOIN demoras dm ON bn.n = dm.n
  LEFT JOIN ultima_aparicion ua ON bn.n = ua.n
  LEFT JOIN afinidad_turno af ON bn.n = af.n
  LEFT JOIN markov mk ON bn.n = mk.n
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;

-- ── 2. CORREGIR TRIGGER auto_verify_saved_predictions ─────────
-- Maneja ambos formatos: array simple {16,03,33,...} y JSON premium {"2":[...],"3":[...],"4":[...]}
CREATE OR REPLACE FUNCTION auto_verify_saved_predictions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pred RECORD;
  drawn_numbers INT[];
  predicted_numbers INT[];
  hit_count INT;
BEGIN
  drawn_numbers := NEW.numbers;

  FOR pred IN
    SELECT * FROM user_predictions
    WHERE turno = NEW.turno
      AND date = NEW.date
      AND status = 'pending'
  LOOP
    -- Detectar formato: si es JSON (contiene '{'), extraer arrays del JSON
    -- Si es array simple, usar directamente
    IF pred.numeros[1] LIKE '{%' THEN
      -- Formato premium: JSON string como primer elemento del array
      -- Ejemplo: '{"2":["53","23","43","77","13","19","83","03","40","80"],"3":[],"4":[]}'
      predicted_numbers := ARRAY(
        SELECT (elem)::INT
        FROM jsonb_array_elements_text(
          (pred.numeros[1])::JSONB -> '2'
        ) AS elem
      );
    ELSE
      -- Formato simple: array de strings numéricos
      predicted_numbers := ARRAY(
        SELECT elem::INT
        FROM unnest(pred.numeros) AS elem
        WHERE elem ~ '^\d+$'
      );
    END IF;

    -- Calcular intersección manual
    hit_count := 0;
    IF predicted_numbers IS NOT NULL AND array_length(predicted_numbers, 1) > 0 THEN
      SELECT COUNT(*) INTO hit_count
      FROM unnest(predicted_numbers) AS p
      WHERE p = ANY(drawn_numbers);
    END IF;

    IF hit_count > 0 THEN
      UPDATE user_predictions
      SET
        status = 'won',
        aciertos = ARRAY(
          SELECT p FROM unnest(predicted_numbers) AS p WHERE p = ANY(drawn_numbers)
        ),
        verified_at = now(),
        updated_at = now()
      WHERE id = pred.id;
    ELSE
      UPDATE user_predictions
      SET
        status = 'lost',
        aciertos = ARRAY[]::INT[],
        verified_at = now(),
        updated_at = now()
      WHERE id = pred.id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 3. ASEGURAR QUE LOS TRIGGERS EXISTAN ─────────────────────
-- Trigger auto-refresh after draw insert
DROP TRIGGER IF EXISTS trg_refresh_predictions ON draws;
CREATE TRIGGER trg_refresh_predictions
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION trigger_refresh_predictions();

-- Trigger auto-verify saved predictions
DROP TRIGGER IF EXISTS trg_auto_verify ON draws;
CREATE TRIGGER trg_auto_verify
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION auto_verify_saved_predictions();

-- ── 4. VERIFICAR QUE TRIGGERS ESTAN ACTIVOS ─────────────────
SELECT
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'draws'
  AND trigger_name IN ('trg_refresh_predictions', 'trg_auto_verify')
ORDER BY trigger_name;
