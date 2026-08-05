-- ============================================================
-- MIGRATION: Cross-Jurisdiccion (Nacional vs Provincia)
-- Date: 2026-08-05
-- Description: Adds jurisdiccion column to draws table and
--   a new factor function for cross-jurisdiction correlation.
-- ============================================================

-- ── 1. Add jurisdiccion column to draws ─────────────────────
DO $$ BEGIN
  ALTER TABLE draws ADD COLUMN IF NOT EXISTS jurisdiccion TEXT DEFAULT 'nacional';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Update existing draws based on turno mapping
-- Nacional: Previa, Matutina, Vespertina
-- Provincia: Primera, Nocturna
UPDATE draws SET jurisdiccion = 'nacional' WHERE turno IN ('Previa', 'Matutina', 'Vespertina');
UPDATE draws SET jurisdiccion = 'provincia' WHERE turno IN ('Primera', 'Nocturna');

CREATE INDEX IF NOT EXISTS idx_draws_jurisdiccion ON draws (jurisdiccion, date DESC);

-- ── 2. RPC: factor_cross_jurisdiccion ───────────────────────
-- Detects migration patterns between Nacional and Provincia.
-- Numbers that appear in Provincia tend to "migrate" to Nacional
-- in the next turno of the same jurisdiction.
CREATE OR REPLACE FUNCTION factor_cross_jurisdiccion(turno_objetivo TEXT, window_days INT DEFAULT 7)
RETURNS TABLE (numero INT, score NUMERIC)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  juris_target TEXT;
BEGIN
  -- Determine target jurisdiction
  IF turno_objetivo IN ('Primera', 'Nocturna') THEN
    juris_target := 'provincia';
  ELSE
    juris_target := 'nacional';
  END IF;

  RETURN QUERY
  WITH recent_draws AS (
    SELECT d.date, d.turno, d.numbers, d.jurisdiccion,
           ROW_NUMBER() OVER (PARTITION BY d.jurisdiccion ORDER BY d.date DESC, d.created_at DESC) AS rn
    FROM draws d
    WHERE d.date >= (argentina_today() - window_days)
  ),
  -- Numbers from the OPPOSITE jurisdiction in recent draws
  cross_jurisdiction AS (
    SELECT MOD(d.numbers[i], 100) AS num, COUNT(*) AS migration_count
    FROM recent_draws d, generate_subscripts(d.numbers, 1) AS i
    WHERE i BETWEEN 1 AND 20
      AND d.jurisdiccion != juris_target
      AND d.rn <= 15  -- last 15 draws from other jurisdiction
    GROUP BY MOD(d.numbers[i], 100)
  ),
  -- Numbers from SAME jurisdiction for baseline
  same_jurisdiction AS (
    SELECT MOD(d.numbers[i], 100) AS num, COUNT(*) AS base_count
    FROM recent_draws d, generate_subscripts(d.numbers, 1) AS i
    WHERE i BETWEEN 1 AND 20
      AND d.jurisdiccion = juris_target
      AND d.rn <= 100
    GROUP BY MOD(d.numbers[i], 100)
  ),
  max_cross AS (SELECT COALESCE(MAX(migration_count), 1) AS mx FROM cross_jurisdiction)

  SELECT
    cj.num AS numero,
    (COALESCE(cj.migration_count, 0)::NUMERIC / mc.mx * 10)::NUMERIC(6,3) AS score
  FROM cross_jurisdiction cj
  CROSS JOIN max_cross mc
  WHERE cj.migration_count >= 2  -- at least 2 appearances
  ORDER BY score DESC;
END;
$$;
