-- BA Fitness: weekly community PR board + comment likes / replies
-- Run once in Supabase SQL Editor after social_schema.sql

-- Personal records hit this week (community feed)
CREATE TABLE IF NOT EXISTS arena_pr_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    exercise_id uuid,
    exercise_name text NOT NULL,
    weight numeric NOT NULL CHECK (weight > 0),
    reps integer,
    previous_weight numeric,
    achieved_at timestamptz NOT NULL DEFAULT now(),
    week_start date NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_pr_events_week_idx
    ON arena_pr_events (week_start DESC, achieved_at DESC);

CREATE INDEX IF NOT EXISTS arena_pr_events_user_idx
    ON arena_pr_events (user_id, achieved_at DESC);

-- Cheers on a PR card
CREATE TABLE IF NOT EXISTS arena_pr_likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id uuid NOT NULL REFERENCES arena_pr_events(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (pr_id, actor_user_id)
);

CREATE INDEX IF NOT EXISTS arena_pr_likes_pr_idx ON arena_pr_likes (pr_id);

-- Comments on a PR card (supports replies via parent_id)
CREATE TABLE IF NOT EXISTS arena_pr_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    pr_id uuid NOT NULL REFERENCES arena_pr_events(id) ON DELETE CASCADE,
    author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES arena_pr_comments(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_pr_comments_pr_idx
    ON arena_pr_comments (pr_id, created_at);

-- Likes on leaderboard comments
ALTER TABLE arena_comments
    ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES arena_comments(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS arena_comment_likes (
    comment_id uuid NOT NULL REFERENCES arena_comments(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, actor_user_id)
);

-- Likes on PR-board comments
CREATE TABLE IF NOT EXISTS arena_pr_comment_likes (
    comment_id uuid NOT NULL REFERENCES arena_pr_comments(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (comment_id, actor_user_id)
);

ALTER TABLE arena_pr_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_pr_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_pr_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_comment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_pr_comment_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arena_pr_events_select" ON arena_pr_events
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_pr_events_insert" ON arena_pr_events
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "arena_pr_likes_select" ON arena_pr_likes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_pr_likes_insert" ON arena_pr_likes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_user_id);

CREATE POLICY "arena_pr_likes_delete" ON arena_pr_likes
    FOR DELETE TO authenticated USING (auth.uid() = actor_user_id);

CREATE POLICY "arena_pr_comments_select" ON arena_pr_comments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_pr_comments_insert" ON arena_pr_comments
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_user_id);

CREATE POLICY "arena_pr_comments_delete" ON arena_pr_comments
    FOR DELETE TO authenticated USING (auth.uid() = author_user_id);

CREATE POLICY "arena_comment_likes_select" ON arena_comment_likes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_comment_likes_insert" ON arena_comment_likes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_user_id);

CREATE POLICY "arena_comment_likes_delete" ON arena_comment_likes
    FOR DELETE TO authenticated USING (auth.uid() = actor_user_id);

CREATE POLICY "arena_pr_comment_likes_select" ON arena_pr_comment_likes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_pr_comment_likes_insert" ON arena_pr_comment_likes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = actor_user_id);

CREATE POLICY "arena_pr_comment_likes_delete" ON arena_pr_comment_likes
    FOR DELETE TO authenticated USING (auth.uid() = actor_user_id);
