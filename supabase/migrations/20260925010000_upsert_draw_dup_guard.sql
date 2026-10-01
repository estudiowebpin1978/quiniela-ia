-- Guard de integridad: upsert_draw rechaza números idénticos al sorteo
-- anterior del mismo turno (detecta fuentes corruptas que repiten el mismo
-- resultado día tras día — visto con numerosenvivo.com.ar en 2025-2026).
CREATE OR REPLACE FUNCTION upsert_draw(
  p_date DATE,
  p_turno TEXT,
  p_numbers INT[],
  p_source TEXT,
  p_game_id UUID,
  p_jurisdiccion TEXT DEFAULT 'nacional',
  p_html_hash TEXT DEFAULT NULL,
  p_confidence_score NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
  v_prev INT[];
  v_prev_sorted INT[];
  v_new_sorted INT[];
BEGIN
  SELECT d.numbers INTO v_prev
  FROM draws d
  WHERE d.turno = p_turno
    AND d.game_id = p_game_id
    AND d.date < p_date
  ORDER BY d.date DESC
  LIMIT 1;

  IF v_prev IS NOT NULL AND array_length(v_prev, 1) = array_length(p_numbers, 1) THEN
    SELECT array_agg(x ORDER BY x) INTO v_prev_sorted FROM unnest(v_prev) AS x;
    SELECT array_agg(x ORDER BY x) INTO v_new_sorted FROM unnest(p_numbers) AS x;
    IF v_prev_sorted = v_new_sorted THEN
      RAISE EXCEPTION 'upsert_draw: números idénticos al sorteo anterior (turno=%, fecha=%) — posible fuente corrupta', p_turno, p_date
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  INSERT INTO draws (date, turno, numbers, source, game_id, jurisdiccion, html_hash, confidence_score, created_at)
  VALUES (p_date, p_turno, p_numbers, p_source, p_game_id, p_jurisdiccion, p_html_hash, p_confidence_score, NOW())
  ON CONFLICT (date, turno, game_id)
  DO UPDATE SET
    numbers = EXCLUDED.numbers,
    source = EXCLUDED.source,
    html_hash = EXCLUDED.html_hash,
    confidence_score = EXCLUDED.confidence_score
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
