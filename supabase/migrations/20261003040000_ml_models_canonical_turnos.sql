-- Fix (drift de BD): ml_models tenía turnos en minúscula (entrenados 25/08)
-- además de los canónicos → la carga por `.eq("turno", "Matutina")`
-- (case-sensitive) no encontraba nunca 'matutina' y la fila duplicada vieja
-- coexistía con la nueva. Resultado: ML nunca cargaba para Matutina y había
-- filas duplicadas en 5 turnos.
--
-- 1) Borrar duplicados en minúscula que ya tienen su fila canónica
--    (Nocturna/Previa/Primera/Vespertina — todas más recientes).
-- 2) Renombrar la única fila 'matutina' a 'Matutina' (no existe canónica).

DELETE FROM public.ml_models m
WHERE m.turno IN ('nocturna', 'previa', 'primera', 'vespertina')
  AND EXISTS (
    SELECT 1 FROM public.ml_models c
    WHERE c.turno = INITCAP(m.turno)
  );

UPDATE public.ml_models SET turno = 'Matutina' WHERE turno = 'matutina';
