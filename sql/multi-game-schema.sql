-- ============================================================
-- MIGRACIÓN: Multi-game support for Quiniela IA
-- Adds games table and makes draws/predictions polymorphic
-- Execute in Supabase SQL Editor
-- ============================================================

-- === 1. Games table ===
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,           -- 'quiniela', 'quini6', 'lotto', etc.
  name TEXT NOT NULL,                  -- 'Quiniela Nacional', 'Quini 6'
  description TEXT,
  number_count INTEGER NOT NULL,       -- How many numbers per draw (20 for quiniela, 6 for quini6)
  number_range_min INTEGER NOT NULL,   -- Min value (0 for quiniela)
  number_range_max INTEGER NOT NULL,   -- Max value (9999 for quiniela)
  turns JSONB DEFAULT '[]'::jsonb,     -- Available turnos: ["Previa","Primera",...]
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role only games" ON games;
CREATE POLICY "Service role only games" ON games FOR ALL USING (auth.role() = 'service_role');

-- Public read access for active games
DROP POLICY IF EXISTS "Public read active games" ON games;
CREATE POLICY "Public read active games" ON games FOR SELECT USING (is_active = true);

-- === 2. Seed default games ===
INSERT INTO games (slug, name, description, number_count, number_range_min, number_range_max, turns)
VALUES
  ('quiniela', 'Quiniela Nacional', 'Quiniela tradicional de 20 números de 4 cifras', 20, 0, 9999,
   '["Previa","Primera","Matutina","Vespertina","Nocturna"]'::jsonb),
  ('quini6', 'Quini 6', 'Lottery de 6 números del 0 al 45', 6, 0, 45,
   '["Sabado"]'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- === 3. Add game_id to draws table ===
-- First, add the column (nullable for migration)
ALTER TABLE draws ADD COLUMN IF NOT EXISTS game_id UUID;

-- Populate game_id for existing rows (all are quiniela)
UPDATE draws SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;

-- Now add the foreign key and make it NOT NULL
ALTER TABLE draws ADD CONSTRAINT fk_draws_game
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE draws ALTER COLUMN game_id SET NOT NULL;

-- Create index for game_id
CREATE INDEX IF NOT EXISTS idx_draws_game_id ON draws(game_id);
CREATE INDEX IF NOT EXISTS idx_draws_game_turno_date ON draws(game_id, turno, date DESC);

-- === 4. Add game_id to prediction_history table ===
ALTER TABLE prediction_history ADD COLUMN IF NOT EXISTS game_id UUID;

-- Populate game_id for existing rows
UPDATE prediction_history SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;

ALTER TABLE prediction_history ADD CONSTRAINT fk_prediction_history_game
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE prediction_history ALTER COLUMN game_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_prediction_history_game_id ON prediction_history(game_id);
CREATE INDEX IF NOT EXISTS idx_prediction_history_game_fecha_turno ON prediction_history(game_id, fecha, turno);

-- === 5. Add game_id to user_predictions table (if exists) ===
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_predictions') THEN
    -- Add column
    IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'user_predictions' AND column_name = 'game_id') THEN
      ALTER TABLE user_predictions ADD COLUMN game_id UUID;
      
      -- Populate
      UPDATE user_predictions SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;
      
      -- Add constraint
      ALTER TABLE user_predictions ADD CONSTRAINT fk_user_predictions_game
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;
      
      ALTER TABLE user_predictions ALTER COLUMN game_id SET NOT NULL;
      
      CREATE INDEX IF NOT EXISTS idx_user_predictions_game_id ON user_predictions(game_id);
    END IF;
  END IF;
END $$;

-- === 6. Add game_id to ml_models table ===
ALTER TABLE ml_models ADD COLUMN IF NOT EXISTS game_id UUID;

-- Populate
UPDATE ml_models SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;

ALTER TABLE ml_models ADD CONSTRAINT fk_ml_models_game
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE ml_models ALTER COLUMN game_id SET NOT NULL;

-- Drop the old UNIQUE constraint on turno and add composite unique
ALTER TABLE ml_models DROP CONSTRAINT IF EXISTS ml_models_turno_key;
ALTER TABLE ml_models ADD CONSTRAINT ml_models_turno_game UNIQUE (turno, game_id);

-- === 7. Add game_id to ml_dl_models table ===
ALTER TABLE ml_dl_models ADD COLUMN IF NOT EXISTS game_id UUID;

UPDATE ml_dl_models SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;

ALTER TABLE ml_dl_models ADD CONSTRAINT fk_ml_dl_models_game
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE ml_dl_models ALTER COLUMN game_id SET NOT NULL;

ALTER TABLE ml_dl_models DROP CONSTRAINT IF EXISTS ml_dl_models_turno_key;
ALTER TABLE ml_dl_models ADD CONSTRAINT ml_dl_models_turno_game UNIQUE (turno, game_id);

-- === 8. Add game_id to motor_performance table ===
ALTER TABLE motor_performance ADD COLUMN IF NOT EXISTS game_id UUID;

UPDATE motor_performance SET game_id = (SELECT id FROM games WHERE slug = 'quiniela') WHERE game_id IS NULL;

ALTER TABLE motor_performance ADD CONSTRAINT fk_motor_performance_game
  FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE;

ALTER TABLE motor_performance ALTER COLUMN game_id SET NOT NULL;

ALTER TABLE motor_performance DROP CONSTRAINT IF EXISTS motor_performance_motor_turno_key;
ALTER TABLE motor_performance ADD CONSTRAINT motor_performance_motor_turno_game UNIQUE (motor, turno, game_id);

-- === 9. Update RLS policies for game-scoped access ===
-- Allow public to read draws for active games
DROP POLICY IF EXISTS "Public read draws" ON draws;
CREATE POLICY "Public read draws" ON draws FOR SELECT USING (true);

-- Allow public to read community trends for active games
DROP POLICY IF EXISTS "Public read community_trends" ON community_trends;
CREATE POLICY "Public read community_trends" ON community_trends FOR SELECT USING (true);

-- === 10. Helper function to get game by slug ===
CREATE OR REPLACE FUNCTION get_game_by_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  slug TEXT,
  name TEXT,
  number_count INTEGER,
  number_range_min INTEGER,
  number_range_max INTEGER,
  turns JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT g.id, g.slug, g.name, g.number_count, g.number_range_min, g.number_range_max, g.turns
  FROM games g
  WHERE g.slug = p_slug AND g.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- === DONE ===
-- Multi-game schema migration complete.
-- All existing data is now scoped to the 'quiniela' game.
-- New games can be added by inserting into the 'games' table.