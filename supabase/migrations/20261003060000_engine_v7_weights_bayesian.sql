-- Fix M5 (informe forense fase 2): engine_v7_weights.w_bayesian = 0 en las 5
-- filas canónicas → el factor bayesiano (posterior) estaba MUERTO en V7 pese a
-- que el código (lib/analisis/v7-weights.ts y engine-v7.ts) asume 0.03 como
-- valor por defecto. Se alinea la BD con el default documentado en código
-- (la suma total pasa de 1.00 a 1.03 = exactamente los defaults de loadV7Weights).

UPDATE engine_v7_weights
SET w_bayesian = 0.03,
    updated_at = now()
WHERE w_bayesian = 0;
