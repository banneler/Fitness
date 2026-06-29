-- BA Fitness: lightweight arena social (likes + comments on leaderboard rows)
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)

-- Cheers / likes on a user's leaderboard standing (per metric tab)
CREATE TABLE IF NOT EXISTS arena_likes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    context text NOT NULL CHECK (context IN ('volume', 'sessions', 'streak')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (target_user_id, actor_user_id, context)
);

CREATE INDEX IF NOT EXISTS arena_likes_target_context_idx
    ON arena_likes (target_user_id, context);

CREATE INDEX IF NOT EXISTS arena_likes_context_idx
    ON arena_likes (context);

-- Short comments on leaderboard rows (per metric tab)
CREATE TABLE IF NOT EXISTS arena_comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    context text NOT NULL CHECK (context IN ('volume', 'sessions', 'streak')),
    body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 280),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arena_comments_target_context_idx
    ON arena_comments (target_user_id, context, created_at);

ALTER TABLE arena_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE arena_comments ENABLE ROW LEVEL SECURITY;

-- Likes: anyone authenticated can read; users manage their own likes
CREATE POLICY "arena_likes_select" ON arena_likes
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_likes_insert" ON arena_likes
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = actor_user_id);

CREATE POLICY "arena_likes_delete" ON arena_likes
    FOR DELETE TO authenticated
    USING (auth.uid() = actor_user_id);

-- Comments: anyone authenticated can read; users manage their own comments
CREATE POLICY "arena_comments_select" ON arena_comments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "arena_comments_insert" ON arena_comments
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = author_user_id);

CREATE POLICY "arena_comments_delete" ON arena_comments
    FOR DELETE TO authenticated
    USING (auth.uid() = author_user_id);
