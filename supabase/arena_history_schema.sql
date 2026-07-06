-- BA Fitness: community leaderboard rank change history (gold cup timeline)
-- Run once in Supabase SQL Editor (after social_schema.sql)

CREATE TABLE IF NOT EXISTS arena_rank_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type text NOT NULL CHECK (event_type IN ('crown_change', 'rank_change', 'entered')),
    metric text NOT NULL CHECK (metric IN ('volume', 'sessions', 'streak')),
    user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    previous_leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    new_leader_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    old_rank integer CHECK (old_rank IS NULL OR old_rank > 0),
    new_rank integer CHECK (new_rank IS NULL OR new_rank > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_rank_events_created_idx
    ON arena_rank_events (created_at DESC);

CREATE INDEX IF NOT EXISTS arena_rank_events_metric_idx
    ON arena_rank_events (metric, created_at DESC);

ALTER TABLE arena_rank_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arena_rank_events_select" ON arena_rank_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_rank_events_insert" ON arena_rank_events
    FOR INSERT TO authenticated WITH CHECK (true);
