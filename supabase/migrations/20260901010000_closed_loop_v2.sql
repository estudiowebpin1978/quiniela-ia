-- ══════════════════════════════════════════════════════════════════════════════
-- CLOSED-LOOP v2: official_draws SSOT + set-based trigger + autopilot hardened
-- ══════════════════════════════════════════════════════════════════════════════

-- ── FASE 1: Refactor official_draws to VARCHAR(4) + JSONB ────────────────────

-- 1a. Drop existing triggers that depend on official_draws columns
DROP TRIGGER IF EXISTS trg_verify_on_official_draw ON official_draws;
DROP TRIGGER IF EXISTS trg_sync_official_from_draw ON draws;

-- 1b. Alter official_draws: cabeza → VARCHAR(4), premios → JSONB
ALTER TABLE official_draws DROP COLUMN IF EXISTS cabeza;
ALTER TABLE official_draws DROP COLUMN IF EXISTS premios;

ALTER TABLE official_draws ADD COLUMN cabeza VARCHAR(4) NOT NULL DEFAULT '0000';
ALTER TABLE official_draws ADD COLUMN premios_array JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 1c. Rebuild unique constraint (drop old, add new without game_id for SSOT purity)
ALTER TABLE official_draws DROP CONSTRAINT IF EXISTS official_draws_date_turno_game_id_key;
ALTER TABLE official_draws ADD CONSTRAINT official_draws_fecha_turno_unique UNIQUE (date, turno);

-- 1d. Re-create RLS (keep existing policies)
-- Policies already exist from previous migration, no changes needed

-- 1e. Recreate upsert_official_draw with new signature
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
  v_cabeza VARCHAR(4);
  v_premios_json JSONB;
BEGIN
  -- Extract cabeza (2 cifras, zero-padded) from first prize
  v_cabeza := LPAD(MOD(p_premios[1], 100)::TEXT, 2, '0');
  -- Convert integer array to JSONB
  v_premios_json := to_jsonb(p_premios);

  INSERT INTO official_draws (date, turno, cabeza, premios_array, source, game_id, scraped_at)
  VALUES (p_date, p_turno, v_cabeza, v_premios_json, p_source, p_game_id, NOW())
  ON CONFLICT (date, turno)
  DO UPDATE SET
    cabeza = v_cabeza,
    premios_array = v_premios_json,
    source = p_source,
    game_id = p_game_id,
    scraped_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ── FASE 2: Set-Based Verification Trigger (no row-by-row loops) ─────────────

CREATE OR REPLACE FUNCTION verify_user_predictions_after_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cabeza_2 VARCHAR(2);
  v_cabeza_3 VARCHAR(3);
  v_cabeza_4 VARCHAR(4);
  v_cabeza_int INTEGER;
BEGIN
  -- Extract cabeza in all formats
  v_cabeza_2 := RIGHT(NEW.cabeza, 2);
  v_cabeza_3 := LPAD(NEW.cabeza, 3, '0');
  v_cabeza_4 := LPAD(NEW.cabeza, 4, '0');
  v_cabeza_int := NEW.cabeza::INTEGER;

  -- ══════════════════════════════════════════════════════════════════════════
  -- SET-BASED: Update all PENDING predictions for this fecha+turno in ONE shot
  -- No FOR loops, no row-by-row processing. Pure集合 SQL.
  -- ══════════════════════════════════════════════════════════════════════════

  -- ── Step 1: Mark exact hits (WON) ──
  UPDATE user_predictions
  SET status = 'WON',
      aciertos = ARRAY[1],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING'
    AND (
      -- Free users: flat text[] — check if cabeza is in the array
      (pg_typeof(numeros)::text = 'text[]' AND v_cabeza_2 = ANY(numeros))
      OR
      -- Premium users: JSON string — check if cabeza is in the "2" array
      (pg_typeof(numeros)::text = 'text[]' AND numeros[1] IS NOT NULL
        AND numeros[1] LIKE '{%'
        AND v_cabeza_2 IN (
          SELECT jsonb_array_elements_text((numeros[1]::jsonb)->'2')
        ))
    );

  -- ── Step 2: Mark near-misses (NEAR_MISS) — ±1 from cabeza ──
  UPDATE user_predictions
  SET status = 'NEAR_MISS',
      aciertos = ARRAY[0],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING'
    AND (
      -- Free users: flat text[] — check if any number is ±1 from cabeza
      (pg_typeof(numeros)::text = 'text[]' AND EXISTS (
        SELECT 1 FROM unnest(numeros) n
        WHERE ABS(n::INTEGER - v_cabeza_int) = 1
      ))
      OR
      -- Premium users: JSON string — check if any number in "2" array is ±1
      (pg_typeof(numeros)::text = 'text[]' AND numeros[1] IS NOT NULL
        AND numeros[1] LIKE '{%'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements_text((numeros[1]::jsonb)->'2') n
          WHERE ABS(n::INTEGER - v_cabeza_int) = 1
        ))
    );

  -- ── Step 3: Mark losses (LOST) — everything still PENDING ──
  UPDATE user_predictions
  SET status = 'LOST',
      aciertos = ARRAY[0],
      verified_at = NOW(),
      updated_at = NOW()
  WHERE date = NEW.date
    AND turno = NEW.turno
    AND status = 'PENDING';

  -- ── Step 4: Insert prediction_history for all verified predictions ──
  INSERT INTO prediction_history (
    prediction_id, user_id, date, turno,
    numeros_2, resultado_oficial,
    aciertos_2, total_aciertos,
    verified, verified_at, game_id
  )
  SELECT
    up.id,
    up.user_id,
    up.date,
    up.turno,
    -- Extract 2-cifras numbers from polymorphic numeros
    CASE
      WHEN up.numeros[1] LIKE '{%' THEN
        ARRAY(SELECT jsonb_array_elements_text((up.numeros[1]::jsonb)->'2'))
      ELSE up.numeros
    END,
    to_jsonb(NEW.premios_array),
    -- aciertos_2: {numero, puesto}
    CASE
      WHEN up.status = 'WON' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 1))
      WHEN up.status = 'NEAR_MISS' THEN
        jsonb_build_array(jsonb_build_object('numero', v_cabeza_2, 'puesto', 0))
      ELSE '[]'::jsonb
    END,
    -- total_aciertos
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    true,
    NOW(),
    NEW.game_id
  FROM user_predictions up
  WHERE up.date = NEW.date
    AND up.turno = NEW.turno
    AND up.status IN ('WON', 'LOST', 'NEAR_MISS')
    AND up.verified_at = NOW()
  ON CONFLICT (prediction_id) DO NOTHING;

  -- ── Step 5: Update user_stats in batch ──
  INSERT INTO user_stats (user_id, total_predictions, total_hits, current_streak, best_streak, last_verified, updated_at)
  SELECT
    up.user_id,
    1,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    CASE WHEN up.status = 'WON' THEN 1 ELSE 0 END,
    NOW(),
    NOW()
  FROM user_predictions up
  WHERE up.date = NEW.date
    AND up.turno = NEW.turno
    AND up.verified_at = NOW()
  ON CONFLICT (user_id) DO UPDATE SET
    total_predictions = user_stats.total_predictions + 1,
    total_hits = user_stats.total_hits + CASE WHEN EXCLUDED.total_hits > 0 THEN 1 ELSE 0 END,
    current_streak = CASE
      WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1
      ELSE 0
    END,
    best_streak = GREATEST(
      user_stats.best_streak,
      CASE WHEN EXCLUDED.total_hits > 0 THEN user_stats.current_streak + 1 ELSE 0 END
    ),
    last_verified = NOW(),
    updated_at = NOW();

  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER trg_verify_on_official_draw
  AFTER INSERT ON official_draws
  FOR EACH ROW
  EXECUTE FUNCTION verify_user_predictions_after_draw();


-- ── FASE 3: Re-create sync trigger (draws → official_draws) ─────────────────

CREATE OR REPLACE FUNCTION sync_official_from_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_premios INTEGER[];
  v_cabeza VARCHAR(4);
  v_premios_json JSONB;
BEGIN
  v_premios := NEW.numbers[1:5];
  v_cabeza := LPAD(MOD(NEW.numbers[1], 100)::TEXT, 2, '0');
  v_premios_json := to_jsonb(v_premios);

  INSERT INTO official_draws (date, turno, cabeza, premios_array, source, game_id, scraped_at)
  VALUES (NEW.date, NEW.turno, v_cabeza, v_premios_json, NEW.source, NEW.game_id, NOW())
  ON CONFLICT (date, turno)
  DO UPDATE SET
    cabeza = v_cabeza,
    premios_array = v_premios_json,
    source = NEW.source,
    game_id = NEW.game_id,
    scraped_at = NOW();

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_official_from_draw
  AFTER INSERT OR UPDATE OF numbers ON draws
  FOR EACH ROW
  WHEN (NEW.numbers IS NOT NULL AND array_length(NEW.numbers, 1) >= 5)
  EXECUTE FUNCTION sync_official_from_draw();
