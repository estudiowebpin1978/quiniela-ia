-- Data cleanup: Remove invalid draws and duplicates
-- 1. Previa 2026-07-12: exact duplicate of 2026-07-11 (same numbers from loteria-ciudad.gob.ar)
-- 2. Primera 2026-07-12: exact duplicate of 2026-07-11 (same numbers from loteria-ciudad.gob.ar)
-- 3. Nocturna 2026-06-20: only 19 numbers (missing 1), from quiniela-nacional1.com.ar
-- 4. Primera 2026-07-21: only 12 numbers (missing 8), from sync

DELETE FROM draws WHERE id IN (
  '41ca9422-2236-4c15-8d94-4e3c2a1dd249',  -- Previa 2026-07-12 (duplicate)
  '39651279-6d4d-4d4f-b4c7-9e2a038c6176',  -- Primera 2026-07-12 (duplicate)
  'ae4b8280-da58-4578-a521-0e6f7b416515',  -- Nocturna 2026-06-20 (19 nums)
  '66296f9d-ab3f-4056-8eac-645f24b06fef'   -- Primera 2026-07-21 (12 nums)
);

-- Result: 933 draws remain (was 937)
-- Matutina: 189, Nocturna: 184, Previa: 188, Primera: 187, Vespertina: 185
