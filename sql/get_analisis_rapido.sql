-- Función SQL rápida para análisis de quiniela (motor híbrido)
CREATE OR REPLACE FUNCTION get_analisis_rapido(p_turno TEXT)
RETURNS TABLE (numero INT, frecuencia INT, cabeza_frecuencia INT, prob_ajustada FLOAT)
LANGUAGE sql STABLE AS $$
  SELECT
    d.numero,
    COUNT(*)::INT AS frecuencia,
    COUNT(CASE WHEN d.posicion = 0 THEN 1 END)::INT AS cabeza_frecuencia,
    ROUND((COUNT(*)::FLOAT / SUM(COUNT(*)) OVER ())::NUMERIC, 4) AS prob_ajustada
  FROM draws d
  WHERE d.turno = p_turno
  GROUP BY d.numero
  ORDER BY frecuencia DESC
  LIMIT 20;
$$;
