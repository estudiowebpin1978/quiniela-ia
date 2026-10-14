-- 20261014041500_fix_check_rate_limit_unnest.sql
--
-- BUG (observado en prod 2026-10-14, logs de Vercel):
--   [RateLimit] RPC error, falling back to local
--   error: column "unnest" does not exist
--   (GET /api/predictions u otros endpoints con checkRateLimit)
--
-- Causa: en el cuerpo de check_rate_limit, "unnest" se usaba como referencia
-- a COLUMNA dentro de WHERE / SELECT list, cuando en realidad es una función
-- set-returning. PostgreSQL falla al parsear:
--   1) v_valid_hits := ARRAY(SELECT unnest(v_hits) WHERE unnest > p_window_start);
--   2) v_reset_at := (SELECT min(unnest) FROM unnest(v_valid_hits) AS u) + ...;
-- Efecto: TODA llamada posterior a la primera por clave tiraba error y caía al
-- fallback en memoria por instancia (rate limit compartido en DB, muerto;
-- ERROR log en cada request). La primera llamada por clave (rama INSERT)
-- sí funcionaba, por eso el error era intermitente/constante según la clave.
--
-- Cambio adicional (corrección de semántica, sin efecto en la lógica de
-- conteo): reset_at devolvía p_now + 3600 (1h hardcodeado) ignorando
-- p_window_sec; ahora devuelve la ventana real. El conteo sliding-window usa
-- p_window_start y NO cambia. Los límites (p_max) y ventanas (p_window_sec)
-- los pasa el caller (lib/rate-limiter.ts) — NO se ajustan.
--
-- Impacto: sólo se reemplaza public.check_rate_limit (mismo nombre, mismos
-- argumentos, mismo retorno). Sin cambios de datos (rate_limits intacta).
-- Idempotente (CREATE OR REPLACE). Reversible: reaplicar la definición
-- original incluida en el comentario "ROLLBACK" al final de este archivo.
--
-- Aplicar con: npx supabase db query --linked -f <este archivo>
-- (1 sentencia por archivo — el CLI sólo ejecuta la última).

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_window_start bigint, p_now bigint, p_max bigint, p_window_sec bigint)
 RETURNS TABLE(allowed boolean, remaining bigint, reset_at bigint, total_hits bigint)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_hits BIGINT[];
  v_valid_hits BIGINT[];
  v_count BIGINT;
  v_reset_at BIGINT;
BEGIN
  SELECT hits INTO v_hits FROM rate_limits WHERE key = p_key;
  IF v_hits IS NULL THEN
    v_valid_hits := ARRAY[p_now];
    v_count := 1::BIGINT;
    v_reset_at := p_now + p_window_sec;
    INSERT INTO rate_limits (key, hits, updated_at)
    VALUES (p_key, v_valid_hits, NOW())
    ON CONFLICT (key) DO UPDATE SET hits = EXCLUDED.hits, updated_at = NOW();
    RETURN QUERY SELECT true::BOOLEAN, (p_max - 1)::BIGINT, (p_now + p_window_sec)::BIGINT, 1::BIGINT;
    RETURN;
  END IF;
  -- FIX: alias de columna explícito (antes "WHERE unnest > ..." → column "unnest" does not exist)
  v_valid_hits := ARRAY(SELECT h FROM unnest(v_hits) AS t(h) WHERE h > p_window_start);
  v_count := array_length(v_valid_hits, 1)::BIGINT;
  IF v_count IS NULL THEN v_count := 0::BIGINT; END IF;
  IF v_count < p_max THEN
    v_valid_hits := v_valid_hits || p_now;
    v_count := v_count + 1;
    UPDATE rate_limits SET hits = v_valid_hits, updated_at = NOW() WHERE key = p_key;
    RETURN QUERY SELECT true::BOOLEAN, (p_max - v_count)::BIGINT, (p_now + p_window_sec)::BIGINT, v_count::BIGINT;
  ELSE
    -- FIX: min(h) sobre el alias de columna (antes min(unnest) → mismo error)
    v_reset_at := (SELECT min(h) FROM unnest(v_valid_hits) AS t(h)) + p_window_sec;
    RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, v_reset_at::BIGINT, v_count::BIGINT;
  END IF;
END;
$function$;

-- ROLLBACK (definición original con los bugs, sólo por reversibilidad):
-- CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_window_start bigint, p_now bigint, p_max bigint, p_window_sec bigint)
--  RETURNS TABLE(allowed boolean, remaining bigint, reset_at bigint, total_hits bigint)
--  LANGUAGE plpgsql
-- AS $function$
-- DECLARE
--   v_hits BIGINT[];
--   v_valid_hits BIGINT[];
--   v_count BIGINT;
--   v_reset_at BIGINT;
-- BEGIN
--   SELECT hits INTO v_hits FROM rate_limits WHERE key = p_key;
--   IF v_hits IS NULL THEN
--     v_valid_hits := ARRAY[p_now];
--     v_count := 1::BIGINT;
--     v_reset_at := p_now + 3600;
--     INSERT INTO rate_limits (key, hits, updated_at)
--     VALUES (p_key, v_valid_hits, NOW())
--     ON CONFLICT (key) DO UPDATE SET hits = EXCLUDED.hits, updated_at = NOW();
--     RETURN QUERY SELECT true::BOOLEAN, (p_max - 1)::BIGINT, (p_now + 3600)::BIGINT, 1::BIGINT;
--     RETURN;
--   END IF;
--   v_valid_hits := ARRAY(SELECT unnest(v_hits) WHERE unnest > p_window_start);
--   v_count := array_length(v_valid_hits, 1)::BIGINT;
--   IF v_count IS NULL THEN v_count := 0::BIGINT; END IF;
--   IF v_count < p_max THEN
--     v_valid_hits := v_valid_hits || p_now;
--     v_count := v_count + 1;
--     UPDATE rate_limits SET hits = v_valid_hits, updated_at = NOW() WHERE key = p_key;
--     RETURN QUERY SELECT true::BOOLEAN, (p_max - v_count)::BIGINT, (p_now + 3600)::BIGINT, v_count::BIGINT;
--   ELSE
--     v_reset_at := (SELECT min(unnest) FROM unnest(v_valid_hits) AS u) + p_window_sec;
--     RETURN QUERY SELECT false::BOOLEAN, 0::BIGINT, v_reset_at::BIGINT, v_count::BIGINT;
--   END IF;
-- END;
-- $function$;
