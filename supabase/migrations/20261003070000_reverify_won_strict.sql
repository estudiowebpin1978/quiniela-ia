-- Re-verificación estricta de la era laxa (informe forense fase 2).
-- Las filas quiniela en 'WON' de la era previa venían del criterio laxo
-- `total_aciertos > 0` (87,9% de "WON" que el azar también alcanza). Se
-- re-marcan con el criterio canónico de la RPC api.verify_predictions_for_draw:
--   WON        = cabeza (MOD(draws.numbers[1],100) en 2 cifras) ∈ picks 2-cifras
--   NEAR_MISS  = cabeza ± 1 ∈ picks
--   LOST       = si no
-- Dry-run sobre las 34 filas: 6 WON / 5 NEAR_MISS / 23 LOST.
--
-- Idempotente (recalcular sobre el estado actual produce lo mismo).
-- NO toca: aciertos (conteos honestos por posición), prediction_history,
-- user_stats (evita doble conteo de stats ya incrementados).
-- Poceada queda fuera (mantiene POCEADA_MATCHES ≥ 5).
WITH target AS (
  SELECT up.id, up.numeros, d.numbers[1] AS head4
  FROM user_predictions up
  JOIN draws d ON d.date = up.date AND d.turno = up.turno
  WHERE up.status = 'WON'
    AND up.turno <> 'Poceada'
    AND d.numbers IS NOT NULL
    AND cardinality(d.numbers) >= 1
),
eval AS (
  SELECT
    t.id,
    LPAD(MOD(t.head4, 100)::TEXT, 2, '0') AS c2,
    LPAD(MOD(t.head4 + 1, 100)::TEXT, 2, '0') AS near_plus,
    LPAD(MOD(t.head4 - 1 + 100, 100)::TEXT, 2, '0') AS near_minus,
    CASE
      WHEN cardinality(t.numeros) = 1 AND t.numeros[1] LIKE '{%'
        THEN coalesce((t.numeros[1]::jsonb) -> '2', '[]'::jsonb)
      ELSE to_jsonb(t.numeros)
    END AS picks2
  FROM target t
)
UPDATE user_predictions up
SET status = CASE
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(e.picks2) j(pick)
    WHERE LPAD(j.pick, 2, '0') = e.c2
  ) THEN 'WON'
  WHEN EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(e.picks2) j(pick)
    WHERE LPAD(j.pick, 2, '0') IN (e.near_plus, e.near_minus)
  ) THEN 'NEAR_MISS'
  ELSE 'LOST'
END
FROM eval e
WHERE up.id = e.id;
