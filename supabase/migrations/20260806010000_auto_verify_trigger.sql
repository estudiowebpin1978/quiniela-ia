-- ============================================================
-- TRIGGER: Queue verification when a draw is inserted
-- Backup mechanism in case cron-scrape doesn't run
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_queue_verification()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO verification_queue (payload, status, created_at)
  VALUES (jsonb_build_object('fecha', NEW.date, 'turno', NEW.turno), 'pending', now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_queue_verification ON draws;
CREATE TRIGGER auto_queue_verification
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION trigger_queue_verification();
