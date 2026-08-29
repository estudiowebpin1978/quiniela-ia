-- ============================================================
-- Engine Omega v2: 7-Factor Ensemble
-- Factors: Calor(18%) + Demora(22%) + Afinidad(12%) + Markov(15%)
--          + Z-Score(13%) + Parity(12%) + SumDist(8%)
-- ============================================================

DROP FUNCTION IF EXISTS calcular_prediccion_maestra(text);

CREATE OR REPLACE FUNCTION calcular_prediccion_maestra(turno_objetivo TEXT)
RETURNS TABLE(
  numero INT,
  puntaje_total NUMERIC(7,3),
  desglose_calor NUMERIC(5,2),
  desglose_demora NUMERIC(5,2),
  desglose_turno NUMERIC(5,2),
  desglose_markov NUMERIC(5,2),
  desglose_zscore NUMERIC(5,2),
  desglose_parity NUMERIC(5,2),
  desglose_sumdist NUMERIC(5,2),
  frecuencia_total INT,
  sorteos_sin_aparecer INT,
  veces_en_turno INT,
  transiciones_markov INT
)
LANGUAGE plpgsql
AS $$
DECLARE
  ultimo_numero_cabeza INT;
BEGIN
  SELECT MOD(numbers[1], 100) INTO ultimo_numero_cabeza
  FROM draws WHERE turno = turno_objetivo
  ORDER BY date DESC, created_at DESC LIMIT 1;

  RETURN QUERY
  WITH
  base_numbers AS (SELECT generate_series(0, 99) AS n),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 1: CALOR (frecuencia últimos 100 sorteos de este turno)
  -- ══════════════════════════════════════════════════════════
  frecuencia_reciente AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS cnt
    FROM (SELECT numbers FROM draws WHERE turno = turno_objetivo ORDER BY date DESC, created_at DESC LIMIT 100) d
    GROUP BY MOD(d.numbers[1], 100)
  ),
  max_apariciones AS (SELECT COALESCE(MAX(cnt), 1)::NUMERIC AS v FROM frecuencia_reciente),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 2: DEMORA (cuántos sorteos hace que no sale)
  -- ══════════════════════════════════════════════════════════
  numbered_draws AS (
    SELECT MOD(numbers[1], 100) AS n, ROW_NUMBER() OVER (ORDER BY date DESC, created_at DESC) AS rn
    FROM draws WHERE turno = turno_objetivo
  ),
  demoras AS (
    SELECT n, (MIN(rn) - 1)::NUMERIC AS atraso FROM numbered_draws GROUP BY n
  ),
  max_demora AS (SELECT COALESCE(MAX(atraso), 1)::NUMERIC AS v FROM demoras),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 3: AFINIDAD DE TURNO (histórico total)
  -- ══════════════════════════════════════════════════════════
  afinidad AS (
    SELECT MOD(numbers[1], 100) AS n, COUNT(*) AS cnt
    FROM draws WHERE turno = turno_objetivo GROUP BY MOD(numbers[1], 100)
  ),
  max_afinidad AS (SELECT COALESCE(MAX(cnt), 1)::NUMERIC AS v FROM afinidad),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 4: MARKOV 1er Orden (transiciones del último número)
  -- ══════════════════════════════════════════════════════════
  markov_data AS (
    SELECT MOD(d_next.numbers[1], 100) AS n, COUNT(*) AS cnt
    FROM draws d_prev
    JOIN draws d_next
      ON (d_next.date > d_prev.date OR (d_next.date = d_prev.date AND d_next.created_at > d_prev.created_at))
      AND d_next.turno = d_prev.turno
    WHERE d_prev.turno = turno_objetivo
      AND MOD(d_prev.numbers[1], 100) = ultimo_numero_cabeza
    GROUP BY MOD(d_next.numbers[1], 100)
  ),
  max_markov AS (SELECT COALESCE(MAX(cnt), 1)::NUMERIC AS v FROM markov_data),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 5: Z-SCORE (desviación estadística de la frecuencia)
  -- Mide qué tan "atípica" es la frecuencia reciente de cada número
  -- respecto a la media global. Números sobre-representados se penalizan.
  -- ══════════════════════════════════════════════════════════
  freq_global AS (
    SELECT MOD(numbers[1], 100) AS n, COUNT(*) AS total_ap
    FROM draws GROUP BY MOD(numbers[1], 100)
  ),
  stats_global AS (
    SELECT AVG(total_ap)::NUMERIC AS media, COALESCE(STDDEV(total_ap), 1)::NUMERIC AS desv
    FROM freq_global
  ),
  freq_reciente_turno AS (
    SELECT MOD(d.numbers[1], 100) AS n, COUNT(*) AS reciente
    FROM (SELECT numbers FROM draws WHERE turno = turno_objetivo ORDER BY date DESC, created_at DESC LIMIT 30) d
    GROUP BY MOD(d.numbers[1], 100)
  ),
  -- Z-Score: positivo = sobre-representado (penalizar), negativo = sub-representado (premiar)
  zscore_raw AS (
    SELECT
      bn.n,
      CASE
        WHEN (SELECT desv FROM stats_global) = 0 THEN 0
        ELSE ((COALESCE(fr.reciente, 0) - (SELECT media FROM stats_global)) / (SELECT desv FROM stats_global))
      END AS z
    FROM base_numbers bn
    LEFT JOIN freq_reciente_turno fr ON bn.n = fr.n
  ),
  -- Normalizar Z-Score a rango 0-100 (invertido: menor Z = mejor puntaje)
  zscore_min AS (SELECT MIN(z) FROM zscore_raw),
  zscore_max AS (SELECT GREATEST(MAX(z) - MIN(z), 1) FROM zscore_raw),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 6: FILTRO ESTRUCTURAL (Paridad: Par-Par, Par-Impar, etc.)
  -- Analiza últimos 10 sorteos: qué combinaciones de paridad están
  -- sub-representadas y las premia.
  -- ══════════════════════════════════════════════════════════
  recent_draws_parity AS (
    SELECT
      MOD(numbers[1], 100) AS n,
      CASE WHEN MOD(MOD(numbers[1], 100), 2) = 0 THEN 'par' ELSE 'impar' END AS d1,
      CASE WHEN MOD(FLOOR(MOD(numbers[1], 100) / 10)::INT, 2) = 0 THEN 'par' ELSE 'impar' END AS d2
    FROM (SELECT numbers FROM draws WHERE turno = turno_objetivo ORDER BY date DESC, created_at DESC LIMIT 10) d
  ),
  parity_counts AS (
    SELECT
      d1 || '-' || d2 AS pattern,
      COUNT(*) AS cnt
    FROM recent_draws_parity
    GROUP BY d1 || '-' || d2
  ),
  -- Patrón más frecuente = el que más sale, el menos frecuente = el que menos sale
  max_parity AS (SELECT COALESCE(MAX(cnt), 1) AS v FROM parity_counts),
  min_parity AS (SELECT COALESCE(MIN(cnt), 0) AS v FROM parity_counts),

  -- Para cada número, calcular score de paridad (inverso a frecuencia del patrón)
  parity_score AS (
    SELECT
      bn.n,
      CASE
        WHEN MOD(bn.n, 10) % 2 = 0 AND (bn.n / 10) % 2 = 0 THEN
          100 - ((SELECT COALESCE(cnt, 0) FROM parity_counts WHERE pattern = 'par-par')::NUMERIC / (SELECT v FROM max_parity) * 100)
        WHEN MOD(bn.n, 10) % 2 = 0 AND (bn.n / 10) % 2 = 1 THEN
          100 - ((SELECT COALESCE(cnt, 0) FROM parity_counts WHERE pattern = 'par-impar')::NUMERIC / (SELECT v FROM max_parity) * 100)
        WHEN MOD(bn.n, 10) % 2 = 1 AND (bn.n / 10) % 2 = 0 THEN
          100 - ((SELECT COALESCE(cnt, 0) FROM parity_counts WHERE pattern = 'impar-par')::NUMERIC / (SELECT v FROM max_parity) * 100)
        ELSE
          100 - ((SELECT COALESCE(cnt, 0) FROM parity_counts WHERE pattern = 'impar-impar')::NUMERIC / (SELECT v FROM max_parity) * 100)
      END AS score
    FROM base_numbers bn
  ),

  -- ══════════════════════════════════════════════════════════
  -- FACTOR 7: DISTRIBUCIÓN DE SUMAS (Ley de los Grandes Números)
  -- Para números de 2 cifras: suma de dígitos (0-18)
  -- Premia sumas en zona central (5-13), penaliza extremos (0-2, 16-18)
  -- ══════════════════════════════════════════════════════════
  sum_dist AS (
    SELECT
      bn.n,
      (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT) AS suma,
      COUNT(*) AS freq
    FROM base_numbers bn
    JOIN draws d ON MOD(d.numbers[1], 100) = bn.n
    WHERE d.turno = turno_objetivo
    GROUP BY bn.n, (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT)
  ),
  max_sum_freq AS (SELECT COALESCE(MAX(freq), 1)::NUMERIC AS v FROM sum_dist),
  -- Zonas de probabilidad: central (5-13) = alta, media (3-4, 14-15) = media, extremos (0-2, 16-18) = baja
  sum_score AS (
    SELECT
      bn.n,
      CASE
        WHEN (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT) BETWEEN 5 AND 13 THEN 90
        WHEN (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT) BETWEEN 3 AND 4 THEN 60
        WHEN (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT) BETWEEN 14 AND 15 THEN 60
        WHEN (MOD(bn.n, 10) + FLOOR(bn.n / 10)::INT) BETWEEN 0 AND 2 THEN 20
        ELSE 20
      END AS score
    FROM base_numbers bn
  )

  -- ══════════════════════════════════════════════════════════
  -- ENSAMBLE FINAL: 7 factores ponderados
  -- Calor=18% Demora=22% Afinidad=12% Markov=15% Z-Score=13% Parity=12% SumDist=8%
  -- ══════════════════════════════════════════════════════════
  SELECT
    bn.n AS numero,
    (
      COALESCE((fr.cnt::NUMERIC / (SELECT v FROM max_apariciones)) * 18, 0) +
      COALESCE((dm.atraso / (SELECT v FROM max_demora)) * 22, 0) +
      COALESCE((af.cnt::NUMERIC / (SELECT v FROM max_afinidad)) * 12, 0) +
      COALESCE((mk.cnt::NUMERIC / (SELECT v FROM max_markov)) * 15, 0) +
      COALESCE(((100 - ((z.z - (SELECT MIN(z) FROM zscore_raw)) / (SELECT GREATEST(MAX(z) - MIN(z), 1) FROM zscore_raw) * 100)) * 13 / 100), 0) +
      COALESCE((ps.score * 12 / 100), 0) +
      COALESCE((ss.score * 8 / 100), 0)
    )::NUMERIC(7,3) AS puntaje_total,

    COALESCE((fr.cnt::NUMERIC / (SELECT v FROM max_apariciones)) * 100, 0)::NUMERIC(5,2) AS desglose_calor,
    COALESCE((dm.atraso / (SELECT v FROM max_demora)) * 100, 0)::NUMERIC(5,2) AS desglose_demora,
    COALESCE((af.cnt::NUMERIC / (SELECT v FROM max_afinidad)) * 100, 0)::NUMERIC(5,2) AS desglose_turno,
    COALESCE((mk.cnt::NUMERIC / (SELECT v FROM max_markov)) * 100, 0)::NUMERIC(5,2) AS desglose_markov,
    COALESCE(((100 - ((z.z - (SELECT MIN(z) FROM zscore_raw)) / (SELECT GREATEST(MAX(z) - MIN(z), 1) FROM zscore_raw) * 100)) * 100 / 100), 50)::NUMERIC(5,2) AS desglose_zscore,
    COALESCE(ps.score, 50)::NUMERIC(5,2) AS desglose_parity,
    COALESCE(ss.score, 50)::NUMERIC(5,2) AS desglose_sumdist,

    COALESCE(fr.cnt, 0)::INT AS frecuencia_total,
    COALESCE(
      (SELECT MAX(date) FROM draws WHERE turno = turno_objetivo) - COALESCE(
        (SELECT MAX(date) FROM draws WHERE turno = turno_objetivo AND MOD(numbers[1], 100) = bn.n),
        '2020-01-01'::DATE
      ), 999
    )::INT AS sorteos_sin_aparecer,
    COALESCE(af.cnt, 0)::INT AS veces_en_turno,
    COALESCE(mk.cnt, 0)::INT AS transiciones_markov

  FROM base_numbers bn
  LEFT JOIN frecuencia_reciente fr ON bn.n = fr.n
  LEFT JOIN demoras dm ON bn.n = dm.n
  LEFT JOIN afinidad af ON bn.n = af.n
  LEFT JOIN markov_data mk ON bn.n = mk.n
  LEFT JOIN zscore_raw z ON bn.n = z.n
  LEFT JOIN parity_score ps ON bn.n = ps.n
  LEFT JOIN sum_score ss ON bn.n = ss.n
  ORDER BY puntaje_total DESC
  LIMIT 10;
END;
$$;
