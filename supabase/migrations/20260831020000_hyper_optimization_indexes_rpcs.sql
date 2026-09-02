-- ═══════════════════════════════════════════════════════════════════
-- HYPER-OPTIMIZATION: Índices agresivos + Auto-pruning + Math RPCs
-- ═══════════════════════════════════════════════════════════════════

-- ── FASE 1A: Índices críticos ─────────────────────────────────────

-- draws: la tabla más consultada SIN índice para (turno, date)
CREATE INDEX IF NOT EXISTS idx_draws_turno_date
  ON draws (turno, date DESC);

-- draws: índice para queries por game_id + turno + date
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date
  ON draws (game_id, turno, date DESC);

-- engine_predictions_log: standalone draw_id para JOINs
CREATE INDEX IF NOT EXISTS idx_epl_draw_id
  ON engine_predictions_log (draw_id);

-- engine_predictions_log: created_at para cleanup temporal
CREATE INDEX IF NOT EXISTS idx_epl_created_at
  ON engine_predictions_log (created_at DESC);

-- user_predictions: user_id + date + turno para queries de auto-predict
CREATE INDEX IF NOT EXISTS idx_up_user_date_turno
  ON user_predictions (user_id, date, turno);

-- user_predictions: user_id standalone para historial de usuario
CREATE INDEX IF NOT EXISTS idx_up_user_id
  ON user_predictions (user_id);

-- ── FASE 1B: Auto-Pruning RPC ─────────────────────────────────────

CREATE OR REPLACE FUNCTION cleanup_old_logs()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM engine_predictions_log WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM webhook_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM scrape_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM auto_predict_log WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM cron_logs WHERE created_at < NOW() - INTERVAL '30 days';
  DELETE FROM app_cache WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- ── FASE 2A: Frecuencias históricas en BD ─────────────────────────

CREATE OR REPLACE FUNCTION calculate_frequencies(
  p_turno TEXT,
  p_top_n INT DEFAULT 10,
  p_days INT DEFAULT 90
)
RETURNS TABLE (numero INT, frecuencia BIGINT, porcentaje NUMERIC)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    d.num AS numero,
    COUNT(*) AS frecuencia,
    ROUND(COUNT(*)::NUMERIC / NULLIF(COUNT(*) OVER (), 0) * 100, 2) AS porcentaje
  FROM (
    SELECT unnest(numbers) AS num
    FROM draws
    WHERE turno = p_turno
      AND date >= CURRENT_DATE - (p_days || ' days')::INTERVAL
  ) d
  GROUP BY d.num
  ORDER BY frecuencia DESC
  LIMIT p_top_n;
$$;

-- ── FASE 2B: Atrasos ("números fríos") en BD ──────────────────────

CREATE OR REPLACE FUNCTION calculate_delays(
  p_turno TEXT,
  p_top_n INT DEFAULT 10
)
RETURNS TABLE (numero INT, sorteos_atras BIGINT, ultima_fecha DATE)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH numbered_draws AS (
    SELECT
      unnest(numbers) AS num,
      date,
      ROW_NUMBER() OVER (PARTITION BY unnest(numbers) ORDER BY date DESC) AS rn
    FROM draws
    WHERE turno = p_turno
  ),
  latest_per_num AS (
    SELECT num, MAX(date) AS ultima_fecha
    FROM numbered_draws WHERE rn = 1
    GROUP BY num
  ),
  total_draws AS (
    SELECT COUNT(*) AS total FROM draws WHERE turno = p_turno
  )
  SELECT
    lpn.num AS numero,
    (td.total - (SELECT COUNT(*) FROM draws WHERE turno = p_turno AND date >= lpn.ultima_fecha))::BIGINT AS sorteos_atras,
    lpn.ultima_fecha
  FROM latest_per_num lpn
  CROSS JOIN total_draws td
  ORDER BY sorteos_atras DESC
  LIMIT p_top_n;
$$;

-- ── FASE 2C: Co-ocurrencia para 3/4 cifras en BD ──────────────────

CREATE OR REPLACE FUNCTION calculate_cooccurrence(
  p_turno TEXT,
  p_base_numbers INT[]
)
RETURNS TABLE (
  base_num INT,
  prefijo_3 TEXT,
  prefijo_4 TEXT,
  frecuencia_3 BIGINT,
  frecuencia_4 BIGINT
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH historical AS (
    SELECT unnest(numbers) AS full_num FROM draws WHERE turno = p_turno
  ),
  freq_hundreds AS (
    SELECT h.base_num, (h.full_num / 100 % 10)::TEXT AS prefijo, COUNT(*) AS freq
    FROM (SELECT unnest(p_base_numbers) AS base_num, full_num FROM historical) h
    WHERE h.full_num % 100 = h.base_num
    GROUP BY h.base_num, h.full_num / 100 % 10
  ),
  best_hundreds AS (
    SELECT DISTINCT ON (base_num) base_num, prefijo, freq
    FROM freq_hundreds ORDER BY base_num, freq DESC
  ),
  freq_thousands AS (
    SELECT t.base_num, (t.full_num / 100)::TEXT AS prefijo, COUNT(*) AS freq
    FROM (SELECT unnest(p_base_numbers) AS base_num, full_num FROM historical) t
    WHERE t.full_num % 100 = t.base_num
    GROUP BY t.base_num, t.full_num / 100
  ),
  best_thousands AS (
    SELECT DISTINCT ON (base_num) base_num, prefijo, freq
    FROM freq_thousands ORDER BY base_num, freq DESC
  )
  SELECT
    bh.base_num,
    LPAD(bh.prefijo, 1, '0') AS prefijo_3,
    LPAD(COALESCE(bt.prefijo, '0'), 2, '0') AS prefijo_4,
    bh.freq AS frecuencia_3,
    COALESCE(bt.freq, 0) AS frecuencia_4
  FROM best_hundreds bh
  LEFT JOIN best_thousands bt ON bt.base_num = bh.base_num;
$$;

-- ── FASE 2D: Meta-ensemble scores en BD ───────────────────────────

CREATE OR REPLACE FUNCTION calculate_meta_scores(
  p_turno TEXT,
  p_top_n INT DEFAULT 10
)
RETURNS TABLE (
  numero INT,
  puntaje_omega NUMERIC,
  frecuencia_score NUMERIC,
  atraso_score NUMERIC,
  tendencia_score NUMERIC
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH freq AS (
    SELECT * FROM calculate_frequencies(p_turno, 100, 90)
  ),
  delays AS (
    SELECT * FROM calculate_delays(p_turno, 100)
  ),
  recent AS (
    SELECT
      unnest(numbers) AS num,
      COUNT(*) AS appearances_last_10
    FROM (SELECT numbers FROM draws WHERE turno = p_turno ORDER BY date DESC LIMIT 10) last10
    GROUP BY num
  )
  SELECT
    f.numero,
    ROUND(
      (f.frecuencia::NUMERIC / NULLIF((SELECT MAX(frecuencia) FROM freq), 0) * 0.4 +
       COALESCE(d.sorteos_atras::NUMERIC / NULLIF((SELECT MAX(sorteos_atras) FROM delays), 0), 0) * 0.3 +
       COALESCE(r.appearances_last_10::NUMERIC / 10, 0) * 0.3
      ), 4) AS puntaje_omega,
    ROUND(f.frecuencia::NUMERIC / NULLIF((SELECT MAX(frecuencia) FROM freq), 0), 4) AS frecuencia_score,
    ROUND(COALESCE(d.sorteos_atras::NUMERIC / NULLIF((SELECT MAX(sorteos_atras) FROM delays), 0), 0), 4) AS atraso_score,
    ROUND(COALESCE(r.appearances_last_10::NUMERIC / 10, 0), 4) AS tendencia_score
  FROM freq f
  LEFT JOIN delays d ON d.numero = f.numero
  LEFT JOIN recent r ON r.num = f.numero
  ORDER BY puntaje_omega DESC
  LIMIT p_top_n;
$$;
