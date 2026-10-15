-- ============================================================================
-- Poceada Federal — consultas SQL de apoyo (SÓLO LECTURA sobre
-- poceada_federal_draws). El motor oficial de estadísticas corre en
-- lib/poceada-federal/estadisticas.ts; estas consultas permiten auditar los
-- números desde la base. Nunca modifican datos.
-- ============================================================================

-- 1. Cobertura y conteos por estado
SELECT estado, COUNT(*) AS cantidad,
       MIN(fecha) AS primera_fecha, MAX(fecha) AS ultima_fecha
FROM poceada_federal_draws
GROUP BY estado
ORDER BY estado;

-- 2. Frecuencia histórica por número (referencia teórica = 20 %)
WITH nums AS (
  SELECT UNNEST(numeros) AS n
  FROM poceada_federal_draws
  WHERE estado = 'validated'
)
SELECT n,
       COUNT(*) AS apariciones,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM nums), 2) AS pct,
       ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM nums) - 20.0, 2) AS desviacion_pp
FROM nums
GROUP BY n
ORDER BY apariciones DESC, n;

-- 3. Frecuencia reciente (últimos 90 días) vs histórico
WITH recientes AS (
  SELECT UNNEST(numeros) AS n
  FROM poceada_federal_draws
  WHERE estado = 'validated' AND fecha >= CURRENT_DATE - 90
),
hist AS (
  SELECT UNNEST(numeros) AS n
  FROM poceada_federal_draws
  WHERE estado = 'validated'
)
SELECT h.n,
       ROUND(100.0 * COUNT(DISTINCT h.n) / NULLIF((SELECT COUNT(*) FROM hist), 0), 2) AS pct_hist,
       ROUND(100.0 * r.cnt / NULLIF((SELECT SUM(cnt) FROM (SELECT n, COUNT(*) cnt FROM recientes GROUP BY n) t), 0), 2) AS pct_reciente_90d
FROM hist h
JOIN (SELECT n, COUNT(*) AS cnt FROM recientes GROUP BY n) r ON r.n = h.n
GROUP BY h.n, r.cnt
ORDER BY pct_reciente_90d DESC;

-- 4. Distribución por decena y paridad (descriptiva)
WITH nums AS (
  SELECT UNNEST(numeros) AS n
  FROM poceada_federal_draws
  WHERE estado = 'validated'
)
SELECT 'decena_' || (n / 10) AS grupo, COUNT(*) AS apariciones
FROM nums GROUP BY n / 10
UNION ALL
SELECT 'par' AS grupo, COUNT(*) FROM nums WHERE n % 2 = 0
UNION ALL
SELECT 'impar' AS grupo, COUNT(*) FROM nums WHERE n % 2 = 1
ORDER BY 1;

-- 5. Coocurrencias: parejas que más aparecen juntas
WITH activos AS (
  SELECT UNNEST(numeros) AS n, concurso
  FROM poceada_federal_draws
  WHERE estado = 'validated'
)
SELECT a.n AS numero_a, b.n AS numero_b, COUNT(*) AS juntos
FROM activos a
JOIN activos b ON a.concurso = b.concurso AND a.n < b.n
GROUP BY a.n, b.n
HAVING COUNT(*) >= 5
ORDER BY juntos DESC
LIMIT 30;

-- 6. Brechas entre sorteos consecutivos (huecos posibles de importación)
WITH f AS (
  SELECT DISTINCT fecha
  FROM poceada_federal_draws
  WHERE estado = 'validated'
  ORDER BY fecha
)
SELECT f1.fecha AS desde, f2.fecha AS hasta,
       (f2.fecha - f1.fecha) AS dias
FROM f f1
JOIN f f2 ON f2.fecha = (
  SELECT MIN(f3.fecha) FROM f f3 WHERE f3.fecha > f1.fecha
)
WHERE f2.fecha - f1.fecha > 4
ORDER BY dias DESC;
