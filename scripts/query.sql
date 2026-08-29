SELECT id, turno, status, aciertos
FROM user_predictions
WHERE date = '2026-08-26' AND turno IN ('Primera', 'Nocturna');
