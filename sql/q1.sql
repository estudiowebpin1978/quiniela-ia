SELECT prediction_id, COUNT(*) as cnt FROM prediction_history GROUP BY prediction_id HAVING COUNT(*) > 1 ORDER BY cnt DESC;
