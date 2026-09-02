-- Add trial_started_at column to prevent infinite trial reset
-- This flag is set once when a user's trial is created and NEVER reset.
-- ensureUserProfile() now checks this flag before creating new trial dates.

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

-- Backfill existing users: set trial_started_at to their current trial_ends_at
-- This ensures existing users keep their current trial (no reset)
UPDATE user_profiles
SET trial_started_at = COALESCE(trial_ends_at, created_at, NOW())
WHERE trial_started_at IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE user_profiles ALTER COLUMN trial_started_at SET NOT NULL;
ALTER TABLE user_profiles ALTER COLUMN trial_started_at SET DEFAULT NOW();
