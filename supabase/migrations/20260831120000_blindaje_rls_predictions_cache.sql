-- MÓDULO 3 — El Blindaje RLS
-- El service_role_key que usa Next.js ignora el RLS automáticamente.
-- Los usuarios anon y authenticated NO pueden leer esta tabla directamente.

-- 1. Asegurar que RLS esté activado
ALTER TABLE predictions_cache ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar cualquier política insegura previa
DROP POLICY IF EXISTS "Anyone can read predictions cache" ON predictions_cache;
DROP POLICY IF EXISTS "Permitir lectura publica" ON predictions_cache;
DROP POLICY IF EXISTS "Public read access" ON predictions_cache;
DROP POLICY IF EXISTS "service_role_read_predictions_cache" ON predictions_cache;
DROP POLICY IF EXISTS "Service role can insert/update predictions cache" ON predictions_cache;

-- 3. Política de "Denegación Total" para la API pública
-- (Los usuarios anon y authenticated NO pueden leer esta tabla directamente)
CREATE POLICY "Deny all public read"
ON predictions_cache
FOR SELECT
USING (false);

-- 4. Service role puede escribir (insert/update) — el backend lo necesita
CREATE POLICY "Service role can insert/update predictions cache"
ON predictions_cache
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
