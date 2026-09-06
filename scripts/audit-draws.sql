-- Auditoría de integridad histórica — ejecutar en Supabase SQL Editor

-- 1) Total por turno (¿qué significa "202 draws"?)
SELECT
  turno,
  COUNT(*) AS total_filas,
  COUNT(DISTINCT date) AS dias_distintos,
  MIN(date) AS desde,
  MAX(date) AS hasta
FROM draws
GROUP BY turno
ORDER BY turno;

-- 2) Sorteos con != 20 números
SELECT date, turno, array_length(numbers, 1) AS puestos, source
FROM draws
WHERE array_length(numbers, 1) IS DISTINCT FROM 20
ORDER BY date DESC
LIMIT 50;

-- 3) Duplicados date+turno
SELECT date, turno, COUNT(*) AS cnt
FROM draws
GROUP BY date, turno
HAVING COUNT(*) > 1
ORDER BY cnt DESC;

-- 4) Huecos recientes (últimos 90 días laborables — aprox)
SELECT d::date AS fecha_esperada, t.turno
FROM generate_series(CURRENT_DATE - 90, CURRENT_DATE, '1 day') d
CROSS JOIN (VALUES ('Previa'),('Primera'),('Matutina'),('Vespertina'),('Nocturna')) t(turno)
WHERE EXTRACT(DOW FROM d) BETWEEN 1 AND 6
  AND NOT EXISTS (
    SELECT 1 FROM draws dr
    WHERE dr.date = d::date AND dr.turno = t.turno
  )
ORDER BY fecha_esperada DESC, t.turno
LIMIT 100;

-- 5) Coherencia predictions_cache vs engine
SELECT turno, date, engine_version, confidence, computed_at
FROM predictions_cache
WHERE date >= CURRENT_DATE - 7
ORDER BY computed_at DESC;

-- 6) Webhooks Ualá (pagos)
SELECT source, status, COUNT(*) FROM webhook_logs GROUP BY source, status;
SELECT * FROM webhook_logs ORDER BY created_at DESC LIMIT 20;
SELECT status, COUNT(*) FROM pending_transfers GROUP BY status;
