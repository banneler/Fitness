BEGIN;

-- BA Fitness: stop forged rank-history rows, lock trigger functions off the API,
-- and pin search_path on public functions the advisor flagged.
-- Idempotent.
--
-- The Arena still records real crown and rank changes. Logged-in users call
-- public.record_arena_rank_changes(), which diffs the leaderboard on the server.
-- Direct inserts into arena_rank_events are no longer allowed.
--
-- ORDERING: the app update tries the function first and, only if it is not
-- deployed yet, falls back to the old client insert. Apply this file before or
-- after the app update. Between this migration and the app update, new rank
-- events stay on each phone (the old client already does that when an insert
-- is rejected) until someone opens the updated app.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.record_arena_rank_changes();
--   CREATE POLICY arena_rank_events_insert ON public.arena_rank_events
--     FOR INSERT TO authenticated WITH CHECK (true);
--   -- search_path and execute grants are not restored automatically.
--   -- To undo search_path on one function: ALTER FUNCTION <signature> RESET search_path;
--   -- To undo the trigger lock: GRANT EXECUTE ON FUNCTION public.handle_new_user() TO authenticated;
--   -- (do not grant it — that reopens the API call the advisor flagged).

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS internal.arena_rank_snapshot (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO internal.arena_rank_snapshot (id, metrics)
VALUES (1, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON TABLE internal.arena_rank_snapshot FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_arena_rank_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
    inserted integer := 0;
    prev jsonb;
    next jsonb;
    metric text;
    prev_order uuid[];
    next_order uuid[];
    uid uuid;
    old_idx integer;
    new_idx integer;
    n_events integer;
BEGIN
    -- One writer at a time so two phones cannot double-insert the same shift.
    PERFORM pg_advisory_xact_lock(872341);

    SELECT count(*) INTO n_events FROM public.arena_rank_events;

    SELECT coalesce(metrics, '{}'::jsonb) INTO prev
    FROM internal.arena_rank_snapshot
    WHERE id = 1
    FOR UPDATE;

    IF prev IS NULL THEN
        INSERT INTO internal.arena_rank_snapshot (id, metrics) VALUES (1, '{}'::jsonb);
        prev := '{}'::jsonb;
    END IF;

    -- The leaderboard view includes the caller when they are hidden
    -- (is_hidden = false OR id = auth.uid()). auth.uid() inside this
    -- definer function is still the caller, so a hidden person would be
    -- written into the public timeline and the order would change depending
    -- on who opened the app. Snapshot only people who are not hidden.
    SELECT jsonb_build_object(
        'volume', coalesce((
            SELECT jsonb_agg(l.user_id ORDER BY l.total_volume DESC NULLS LAST, l.user_id)
            FROM public.leaderboard l
            WHERE l.user_id IN (
                SELECT p.id FROM public.profiles p
                WHERE coalesce(p.is_hidden, false) = false
            )
        ), '[]'::jsonb),
        'sessions', coalesce((
            SELECT jsonb_agg(l.user_id ORDER BY l.sessions_count DESC NULLS LAST, l.user_id)
            FROM public.leaderboard l
            WHERE l.user_id IN (
                SELECT p.id FROM public.profiles p
                WHERE coalesce(p.is_hidden, false) = false
            )
        ), '[]'::jsonb),
        'streak', coalesce((
            SELECT jsonb_agg(l.user_id ORDER BY l.current_streak DESC NULLS LAST, l.user_id)
            FROM public.leaderboard l
            WHERE l.user_id IN (
                SELECT p.id FROM public.profiles p
                WHERE coalesce(p.is_hidden, false) = false
            )
        ), '[]'::jsonb)
    ) INTO next;

    -- Empty timeline: write the opening board once, from the real leaderboard.
    IF n_events = 0 AND prev = '{}'::jsonb THEN
        FOREACH metric IN ARRAY ARRAY['volume', 'sessions', 'streak']
        LOOP
            next_order := ARRAY(
                SELECT value::uuid
                FROM jsonb_array_elements_text(coalesce(next -> metric, '[]'::jsonb)) AS t(value)
            );
            IF coalesce(array_length(next_order, 1), 0) > 0 THEN
                INSERT INTO public.arena_rank_events (event_type, metric, new_leader_id, created_at)
                VALUES ('season_open', metric, next_order[1], now());
                inserted := inserted + 1;
                FOR new_idx IN 1..array_length(next_order, 1) LOOP
                    INSERT INTO public.arena_rank_events (event_type, metric, user_id, new_rank, created_at)
                    VALUES ('entered', metric, next_order[new_idx], new_idx, now() - interval '2 minutes');
                    inserted := inserted + 1;
                END LOOP;
            END IF;
        END LOOP;
        UPDATE internal.arena_rank_snapshot
        SET metrics = next, updated_at = now()
        WHERE id = 1;
        RETURN inserted;
    END IF;

    -- History already exists but this server has no snapshot yet (first run
    -- after this migration). Store the current board and do not invent a diff.
    IF prev = '{}'::jsonb THEN
        UPDATE internal.arena_rank_snapshot
        SET metrics = next, updated_at = now()
        WHERE id = 1;
        RETURN 0;
    END IF;

    FOREACH metric IN ARRAY ARRAY['volume', 'sessions', 'streak']
    LOOP
        prev_order := ARRAY(
            SELECT value::uuid
            FROM jsonb_array_elements_text(coalesce(prev -> metric, '[]'::jsonb)) AS t(value)
        );
        next_order := ARRAY(
            SELECT value::uuid
            FROM jsonb_array_elements_text(coalesce(next -> metric, '[]'::jsonb)) AS t(value)
        );

        IF prev_order[1] IS NOT NULL
           AND next_order[1] IS NOT NULL
           AND prev_order[1] IS DISTINCT FROM next_order[1] THEN
            INSERT INTO public.arena_rank_events (event_type, metric, previous_leader_id, new_leader_id)
            VALUES ('crown_change', metric, prev_order[1], next_order[1]);
            inserted := inserted + 1;
        END IF;

        IF coalesce(array_length(next_order, 1), 0) > 0 THEN
            FOR new_idx IN 1..array_length(next_order, 1) LOOP
                uid := next_order[new_idx];
                old_idx := array_position(prev_order, uid);
                IF old_idx IS NULL THEN
                    INSERT INTO public.arena_rank_events (event_type, metric, user_id, new_rank)
                    VALUES ('entered', metric, uid, new_idx);
                    inserted := inserted + 1;
                ELSIF old_idx IS DISTINCT FROM new_idx THEN
                    INSERT INTO public.arena_rank_events (event_type, metric, user_id, old_rank, new_rank)
                    VALUES ('rank_change', metric, uid, old_idx, new_idx);
                    inserted := inserted + 1;
                END IF;
            END LOOP;
        END IF;
    END LOOP;

    UPDATE internal.arena_rank_snapshot
    SET metrics = next, updated_at = now()
    WHERE id = 1;
    RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.record_arena_rank_changes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_arena_rank_changes() TO authenticated;

-- Remove every insert policy. Authenticated users were allowed to insert any
-- rank event (WITH CHECK true), including crowns for someone else.
DO $$
DECLARE r record;
BEGIN
    IF to_regclass('public.arena_rank_events') IS NULL THEN
        RETURN;
    END IF;
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename = 'arena_rank_events'
          AND cmd = 'INSERT'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.arena_rank_events', r.policyname);
    END LOOP;
END $$;

-- Trigger helpers such as handle_new_user must not be callable through the API.
-- Triggers still run as the function owner.
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND (
            p.prorettype = 'trigger'::regtype
            OR p.proname = 'handle_new_user'
          )
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    END LOOP;
END $$;

-- Fixed search_path on every public function that does not already have one.
-- This covers the advisor's "function search_path mutable" findings without
-- guessing names. Re-running skips functions that already have search_path set.
DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.prokind = 'f'
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d
            WHERE d.objid = p.oid AND d.deptype = 'e'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) AS cfg
            WHERE cfg LIKE 'search_path=%'
          )
    LOOP
        EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', r.sig);
    END LOOP;
END $$;

COMMIT;
