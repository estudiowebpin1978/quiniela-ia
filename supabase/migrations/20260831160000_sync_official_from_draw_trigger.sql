-- ══════════════════════════════════════════════════════════════════════════════
-- FIX: Eliminate dual writes — draws trigger auto-populates official_draws
-- ══════════════════════════════════════════════════════════════════════════════
-- Problem: Scraper wrote to BOTH draws AND official_draws (dual write).
--          If one write fails and the other succeeds → data desync.
-- Solution: draws is the SSOT. A trigger auto-populates official_draws.
--           Scraper ONLY writes to draws.

-- ── 1. Function: extract official prizes from 20-number array ──
CREATE OR REPLACE FUNCTION sync_official_from_draw()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_premios INTEGER[];
  v_cabeza INTEGER;
BEGIN
  -- The official prizes are at positions 1-5 in the numbers array
  -- (head=1st number, premio2=2nd, premio3=3rd, premio4=4th, premio5=5th)
  v_premios := NEW.numbers[1:5];
  v_cabeza := MOD(NEW.numbers[1], 100);

  INSERT INTO official_draws (date, turno, cabeza, premios, source, game_id, scraped_at)
  VALUES (NEW.date, NEW.turno, v_cabeza, v_premios, NEW.source, NEW.game_id, NOW())
  ON CONFLICT (date, turno, game_id)
  DO UPDATE SET
    cabeza = v_cabeza,
    premios = v_premios,
    source = NEW.source,
    scraped_at = NOW();

  RETURN NEW;
END;
$$;

-- ── 2. Trigger: fires on INSERT/UPDATE to draws ──
DROP TRIGGER IF EXISTS trg_sync_official_from_draw ON draws;
CREATE TRIGGER trg_sync_official_from_draw
  AFTER INSERT OR UPDATE OF numbers ON draws
  FOR EACH ROW
  WHEN (NEW.numbers IS NOT NULL AND array_length(NEW.numbers, 1) >= 5)
  EXECUTE FUNCTION sync_official_from_draw();
