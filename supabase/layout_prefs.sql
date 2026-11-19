-- Per-user app layout preferences (mirrors localStorage ba_fitness_user_prefs)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS layout_prefs jsonb;
