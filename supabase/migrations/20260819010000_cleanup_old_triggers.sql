-- Cleanup: drop old triggers/functions that could conflict with trg_verify_predictions

DROP TRIGGER IF EXISTS trg_auto_verify ON draws;
DROP TRIGGER IF EXISTS auto_queue_verification ON draws;
DROP FUNCTION IF EXISTS auto_verify_predictions_on_insert() CASCADE;
DROP FUNCTION IF EXISTS queue_verification_on_draw() CASCADE;
DROP TABLE IF EXISTS verification_queue CASCADE;
