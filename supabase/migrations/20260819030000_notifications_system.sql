-- =============================================================================
-- NOTIFICATIONS SYSTEM: Table, RPCs, Triggers
-- =============================================================================

-- ─── 1. notifications table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('draw_loaded', 'prediction_won', 'prediction_lost', 'trial_expiring', 'premium_expiring', 'system')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}',
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ─── 2. RLS ────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "users_update_own_notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service_role_all_notifications"
  ON notifications FOR ALL
  USING (auth.role() = 'service_role');

-- ─── 3. RPC: insert_notification ───────────────────────────────────────────
-- Called from TypeScript and from DB triggers
CREATE OR REPLACE FUNCTION insert_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_data JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO notifications (user_id, type, title, body, data)
  VALUES (p_user_id, p_type, p_title, p_body, p_data)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- ─── 4. RPC: mark_notifications_read ───────────────────────────────────────
CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET read = TRUE
  WHERE user_id = p_user_id AND read = FALSE;
END;
$$;

-- ─── 5. Trigger: notify on prediction verification (WON/LOST) ──────────────
-- Fires when user_predictions.status changes from PENDING to WON or LOST
CREATE OR REPLACE FUNCTION notify_prediction_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_type TEXT;
  v_data JSONB;
  v_count INT;
BEGIN
  -- Only fire on status change from PENDING
  IF OLD.status = 'PENDING' AND NEW.status IN ('WON', 'LOST') THEN
    -- Count aciertos
    v_count := 0;
    IF NEW.aciertos IS NOT NULL THEN
      SELECT sum(value::int) INTO v_count
      FROM jsonb_array_elements_text(NEW.aciertos::jsonb);
    END IF;

    IF NEW.status = 'WON' THEN
      v_type := 'prediction_won';
      v_title := '🎉 ¡Predicción ganadora!';
      v_body := format('Acertaste %s cifra%s en %s del %s.', v_count, CASE WHEN v_count > 1 THEN 's' ELSE '' END, NEW.turno, to_char(NEW.date, 'DD/MM'));
    ELSE
      v_type := 'prediction_lost';
      v_title := '📊 Resultado verificado';
      v_body := format('Se verificó tu predicción para %s del %s. No hubo aciertos.', NEW.turno, to_char(NEW.date, 'DD/MM'));
    END IF;

    v_data := jsonb_build_object(
      'prediction_id', NEW.id,
      'date', NEW.date,
      'turno', NEW.turno,
      'status', NEW.status,
      'aciertos', NEW.aciertos
    );

    PERFORM insert_notification(NEW.user_id, v_type, v_title, v_body, v_data);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_prediction_verified ON user_predictions;
CREATE TRIGGER trg_notify_prediction_verified
  AFTER UPDATE ON user_predictions
  FOR EACH ROW
  EXECUTE FUNCTION notify_prediction_verified();

-- ─── 6. Trigger: notify on new draw loaded ─────────────────────────────────
-- Fires when a new draw is inserted into draws table
CREATE OR REPLACE FUNCTION notify_draw_loaded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user RECORD;
  v_title TEXT;
  v_body TEXT;
  v_data JSONB;
BEGIN
  v_title := format('🎰 Sorteo %s cargado', NEW.turno);
  v_body := format('Los resultados de %s del %s ya están disponibles. Verificá tus predicciones.', NEW.turno, to_char(NEW.date, 'DD/MM'));
  v_data := jsonb_build_object(
    'draw_id', NEW.id,
    'date', NEW.date,
    'turno', NEW.turno,
    'game_id', NEW.game_id
  );

  -- Notify all users who have PENDING predictions for this date+turno
  FOR v_user IN
    SELECT DISTINCT up.user_id
    FROM user_predictions up
    WHERE up.date = NEW.date
      AND up.turno = NEW.turno
      AND up.status = 'PENDING'
  LOOP
    PERFORM insert_notification(v_user.user_id, 'draw_loaded', v_title, v_body, v_data);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_draw_loaded ON draws;
CREATE TRIGGER trg_notify_draw_loaded
  AFTER INSERT ON draws
  FOR EACH ROW
  EXECUTE FUNCTION notify_draw_loaded();
