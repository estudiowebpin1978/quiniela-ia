-- Add Poceada game to the games table and fix foreign key

-- 1. Create games table if it doesn't exist
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add the Poceada game
INSERT INTO games (id, name)
VALUES ('d0e1f2a3-b4c5-6789-0abc-def012345678', 'Quiniela Poceada')
ON CONFLICT (id) DO NOTHING;

-- 3. Ensure the Nacional game exists
INSERT INTO games (id, name)
VALUES ('ac593199-c299-4f03-b1b7-8675fe4fa6d9', 'Quiniela Nacional')
ON CONFLICT (id) DO NOTHING;

-- 4. Drop the foreign key constraint if it exists (draws should work even without games entry)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_draws_game'
  ) THEN
    ALTER TABLE draws DROP CONSTRAINT fk_draws_game;
  END IF;
END $$;

-- 5. Grant access
GRANT ALL ON games TO service_role;
GRANT ALL ON draws TO service_role;
