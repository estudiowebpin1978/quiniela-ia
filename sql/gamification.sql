-- Gamification tables for Quiniela IA
-- Run this in Supabase SQL Editor

-- User gamification data
CREATE TABLE IF NOT EXISTS user_gamification (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  streak INTEGER DEFAULT 0,
  last_active_date DATE,
  total_analyses INTEGER DEFAULT 0,
  total_saves INTEGER DEFAULT 0,
  total_compares INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User achievements (badges)
CREATE TABLE IF NOT EXISTS user_achievements (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL,
  unlocked_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, achievement_id)
);

-- Community daily trends (cached)
CREATE TABLE IF NOT EXISTS community_trends (
  date DATE NOT NULL,
  turno TEXT NOT NULL,
  hot_numbers JSONB DEFAULT '[]'::jsonb,
  hot_correlations JSONB DEFAULT '[]'::jsonb,
  analysis_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (date, turno)
);

-- RLS policies (service-role only, like other tables)
ALTER TABLE user_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_trends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role all user_gamification" ON user_gamification FOR ALL USING (true);
CREATE POLICY "Service role all user_achievements" ON user_achievements FOR ALL USING (true);
CREATE POLICY "Service role all community_trends" ON community_trends FOR ALL USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_user_gamification_xp ON user_gamification(xp DESC);
CREATE INDEX IF NOT EXISTS idx_user_gamification_level ON user_gamification(level DESC);
CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_community_trends_date ON community_trends(date DESC);
