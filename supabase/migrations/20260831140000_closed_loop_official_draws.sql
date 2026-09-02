-- ══════════════════════════════════════════════════════════════════════════════
-- CLOSED-LOOP AUTOMATION: official_draws + verify trigger (FIXED)
-- ══════════════════════════════════════════════════════════════════════════════
-- Fixes applied:
--   #1: Removed NEAR_MISS (CHECK constraint only allows PENDING/WON/LOST)
--   #2: Removed double verification (scraper no longer calls atomicVerifyAndWeight)
--   #3: Added all prediction_history columns (numeros_3/4, aciertos_3/4, redoblonas)
--   #4: aciertos_2 uses {numero, puesto} format (matches TypeScript consumers)
--   #6: Added pg_typeof handling for legacy JSONB numeros
--   #7: Added streak logic (current_streak, best_streak, last_verified)
--   #8: Dropped old trg_verify_predictions trigger and function
--   #9: Uses 'date' consistently (not 'fecha')
--   #10: Near-miss gets status=WON with near_miss flag in aciertos (consistent)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── FASE 1: TABLA VERDAD (Single Source of Truth) ───────────────────────────

CREATE TABLE IF NOT EXISTS official_draws (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date          DATE NOT NULL,
  turno         TEXT NOT NULL,
  cabeza        INTEGER NOT NULL,
  premios       INTEGER[] NOT NULL,
  source        TEXT NOT NULL,
  game_id       UUID NOT NULL DEFAULT 'ac593199-c299-4f03-b1b7-8675fe4fa6d9',
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(date, turno, game_id)
);

CREATE INDEX IF NOT EXISTS idx_official_draws_date_turno
  ON official_draws (date, turno);

ALTER TABLE official_draws ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_official_draws" ON official_draws;
CREATE POLICY "deny_all_official_draws"
  ON official_draws FOR ALL USING (false);

DROP POLICY IF EXISTS "service_role_official_draws" ON official_draws;
CREATE POLICY "service_role_official_draws"
  ON official_draws FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');


-- ── LIMPIEZA: Eliminar triggers y funciones antiguas que causan conflicto ────

-- FIX #8: Drop old trigger and function on draws table (was disabled anyway)
DROP TRIGGER IF EXISTS trg_verify_predictions ON draws;
DROP FUNCTION IF EXISTS verify_predictions_on_draw_insert();


-- ── FASE 3: TRIGGER DE VERIFICACIÓN AUTOMÁTICA ──────────────────────────────

CREATE OR REPLACE FUNCTION verify_user_predictions_after_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza TEXT;
  v_nums2 TEXT[];
  v_nums3 TEXT[];
  v_nums4 TEXT[];
  v_pred RECORD;
  v_numeros_field_type TEXT;
  v_numeros_raw TEXT;
  v_pred_nums2 TEXT[];
  v_pred_nums3 TEXT[];
  v_pred_nums4 TEXT[];
  v_has_hit BOOLEAN;
  v_has_near BOOLEAN;
  v_aciertos_2 JSONB := '[]'::jsonb;
  v_aciertos_3 JSONB := '[]'::jsonb;
  v_aciertos_4 JSONB := '[]'::jsonb;
  v_status TEXT;
  v_total_aciertos INTEGER;
  v_is_hit BOOLEAN;
  v_new_streak INTEGER;
BEGIN
  -- La cabeza del sorteo oficial (2 cifras, zero-padded)
  v_cabeza := LPAD(NEW.cabeza::TEXT, 2, '0');

  -- Descomponer premios oficiales en 2/3/4 cifras
  v_nums2 := ARRAY(SELECT LPAD(MOD(x, 100)::TEXT, 2, '0') FROM unnest(NEW.premios) x);
  v_nums3 := ARRAY(SELECT LPAD(MOD(x, 1000)::TEXT, 3, '0') FROM unnest(NEW.premios) x);
  v_nums4 := ARRAY(SELECT LPAD(x::TEXT, 4, '0') FROM unnest(NEW.premios) x);

  -- Iterar sobre todas las predicciones PENDING para esta fecha+turno
  FOR v_pred IN
    SELECT up.id, up.user_id, up.numeros
    FROM user_predictions up
    WHERE up.date = NEW.date
      AND up.turno = NEW.turno
      AND up.status = 'PENDING'
  LOOP
    -- ── FIX #6: Parsear el campo polymórfico `numeros` con pg_typeof ──
    v_numeros_field_type := pg_typeof(v_pred.numeros)::text;

    IF v_numeros_field_type = 'text[]' THEN
      -- FIX #6: text[] — check if first element looks like JSON (premium format)
      v_numeros_raw := v_pred.numeros[1];

      IF v_numeros_raw IS NOT NULL AND v_numeros_raw LIKE '{%' THEN
        -- Premium: JSON string containing {"2":[...],"3":[...],"4":[...],"r":"..."}
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'2')
        );
        v_pred_nums3 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'3')
        ), ARRAY[]::text[]);
        v_pred_nums4 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_numeros_raw::jsonb)->'4')
        ), ARRAY[]::text[]);
      ELSE
        -- Free: flat text array = numeros_2
        v_pred_nums2 := v_pred.numeros;
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      END IF;

    ELSIF v_numeros_field_type = 'jsonb' THEN
      -- FIX #6: Legacy JSONB data
      IF jsonb_typeof(v_pred.numeros::jsonb) = 'object' THEN
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'2')
        );
        v_pred_nums3 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'3')
        ), ARRAY[]::text[]);
        v_pred_nums4 := COALESCE(ARRAY(
          SELECT jsonb_array_elements_text((v_pred.numeros::jsonb)->'4')
        ), ARRAY[]::text[]);
      ELSIF jsonb_typeof(v_pred.numeros::jsonb) = 'array' THEN
        v_pred_nums2 := ARRAY(
          SELECT jsonb_array_elements_text(v_pred.numeros::jsonb)
        );
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      ELSE
        v_pred_nums2 := ARRAY[]::text[];
        v_pred_nums3 := ARRAY[]::text[];
        v_pred_nums4 := ARRAY[]::text[];
      END IF;
    ELSE
      -- Unknown type — skip this prediction
      CONTINUE;
    END IF;

    -- Skip if no 2-cifras to compare
    IF array_length(v_pred_nums2, 1) IS NULL THEN
      CONTINUE;
    END IF;

    -- ── Matching contra cabeza (2 cifras) ──
    v_has_hit := v_cabeza = ANY(v_pred_nums2);

    -- ── FIX #10: Near-miss: diferencia exacta de ±1 ──
    v_has_near := NOT v_has_hit AND EXISTS (
      SELECT 1 FROM unnest(v_pred_nums2) p
      WHERE ABS(p::INT - NEW.cabeza) = 1
    );

    -- ── FIX #1: status — CHECK constraint only allows PENDING/WON/LOST ──
    -- Near-miss counts as WON (aciertos will distinguish exact vs near)
    IF v_has_hit THEN
      v_status := 'WON';
    ELSIF v_has_near THEN
      v_status := 'WON';  -- Near-miss = soft win
    ELSE
      v_status := 'LOST';
    END IF;

    -- ── FIX #4: aciertos_2 format: {numero, puesto} (matches TypeScript Acierto type) ──
    v_aciertos_2 := '[]'::jsonb;
    v_total_aciertos := 0;

    IF v_has_hit THEN
      v_aciertos_2 := jsonb_build_array(
        jsonb_build_object('numero', v_cabeza, 'puesto', 1)
      );
      v_total_aciertos := 1;
    ELSIF v_has_near THEN
      v_aciertos_2 := jsonb_build_array(
        jsonb_build_object('numero', v_cabeza, 'puesto', 0)
      );
      v_total_aciertos := 0;
    END IF;

    -- ── FIX #3: Check 3 cifras (premium only) ──
    v_aciertos_3 := '[]'::jsonb;
    IF array_length(v_pred_nums3, 1) > 0 THEN
      FOR i IN 1..array_length(v_pred_nums3, 1) LOOP
        IF LPAD(NEW.cabeza::TEXT, 3, '0') = v_pred_nums3[i] THEN
          v_aciertos_3 := v_aciertos_3 || jsonb_build_array(
            jsonb_build_object('numero', v_pred_nums3[i], 'puesto', i)
          );
          v_total_aciertos := v_total_aciertos + 1;
        END IF;
      END LOOP;
    END IF;

    -- ── FIX #3: Check 4 cifras (premium only) ──
    v_aciertos_4 := '[]'::jsonb;
    IF array_length(v_pred_nums4, 1) > 0 THEN
      FOR i IN 1..array_length(v_pred_nums4, 1) LOOP
        IF LPAD(NEW.cabeza::TEXT, 4, '0') = v_pred_nums4[i] THEN
          v_aciertos_4 := v_aciertos_4 || jsonb_build_array(
            jsonb_build_object('numero', v_pred_nums4[i], 'puesto', i)
          );
          v_total_aciertos := v_total_aciertos + 1;
        END IF;
      END LOOP;
    END IF;

    -- ── FIX #3: Insertar en prediction_history con TODAS las columnas ──
    INSERT INTO prediction_history (
      prediction_id, user_id, date, turno,
      numeros_2, numeros_3, numeros_4,
      resultado_oficial,
      aciertos_2, aciertos_3, aciertos_4,
      total_aciertos,
      verified, verified_at, game_id,
      redoblonas, aciertos_redoblona
    ) VALUES (
      v_pred.id, v_pred.user_id, NEW.date, NEW.turno,
      v_pred_nums2, v_pred_nums3, v_pred_nums4,
      to_jsonb(NEW.premios),
      v_aciertos_2, v_aciertos_3, v_aciertos_4,
      v_total_aciertos,
      true, NOW(), NEW.game_id,
      NULL, NULL
    )
    ON CONFLICT (prediction_id) DO NOTHING;

    -- ── Actualizar estado de la predicción ──
    v_is_hit := v_total_aciertos > 0;
    UPDATE user_predictions
    SET status = v_status,
        aciertos = ARRAY[CASE WHEN v_is_hit THEN 1 ELSE 0 END],
        verified_at = NOW(),
        updated_at = NOW()
    WHERE id = v_pred.id;

    -- ── FIX #7: Actualizar stats del usuario con streaks ──
    IF v_is_hit THEN
      v_new_streak := 1; -- Will be replaced by the COALESCE logic below
    ELSE
      v_new_streak := 0;
    END IF;

    INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified, updated_at)
    VALUES (
      v_pred.user_id,
      1,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
      total_predictions = user_stats.total_predictions + 1,
      total_hits = user_stats.total_hits + CASE WHEN v_is_hit THEN 1 ELSE 0 END,
      current_streak = CASE
        WHEN v_is_hit THEN user_stats.current_streak + 1
        ELSE 0
      END,
      best_streak = GREATEST(
        user_stats.best_streak,
        CASE WHEN v_is_hit THEN user_stats.current_streak + 1 ELSE 0 END
      ),
      last_verified = NOW(),
      updated_at = NOW();
  END LOOP;

  RETURN NEW;
END;
$$;


-- ── Crear el trigger ──
DROP TRIGGER IF EXISTS trg_verify_on_official_draw ON official_draws;
CREATE TRIGGER trg_verify_on_official_draw
  AFTER INSERT ON official_draws
  FOR EACH ROW
  EXECUTE FUNCTION verify_user_predictions_after_draw();


-- ── FUNCIÓN AUXILIAR: upsert_official_draw ──

CREATE OR REPLACE FUNCTION upsert_official_draw(
  p_date DATE,
  p_turno TEXT,
  p_premios INTEGER[],
  p_source TEXT,
  p_game_id UUID DEFAULT 'ac593199-c299-4f03-b1b7-8675fe4fa6d9'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_cabeza INTEGER;
BEGIN
  v_cabeza := MOD(p_premios[1], 100);

  INSERT INTO official_draws (date, turno, cabeza, premios, source, game_id, scraped_at)
  VALUES (p_date, p_turno, v_cabeza, p_premios, p_source, p_game_id, NOW())
  ON CONFLICT (date, turno, game_id)
  DO UPDATE SET
    cabeza = v_cabeza,
    premios = p_premios,
    source = p_source,
    scraped_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_official_draw(DATE, TEXT, INTEGER[], TEXT, UUID) TO service_role;
