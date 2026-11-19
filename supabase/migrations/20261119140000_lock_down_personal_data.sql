BEGIN;

-- BA Fitness: stop the anon key from reading personal data.
-- Idempotent. Apply before or with the app update. The current app keeps working
-- for logged-in users: leaderboard stays a security-definer view (so it can
-- aggregate everyone's workouts) but anon can no longer select it, and hidden
-- profiles stay off that view. Profiles of people who are not hidden remain
-- readable by logged-in users, which the Arena already needs.
--
-- ROLLBACK (restores the public leak — only use if a migration step breaks login):
--   GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
--   CREATE POLICY profiles_select_public ON public.profiles FOR SELECT TO anon, authenticated USING (true);
--   ALTER VIEW public.daily_nutrition_totals SET (security_invoker = false);
--   -- Then recreate the previous view body from a backup if the WHERE auth.uid()
--   -- wrapper was applied. pg_get_viewdef before this migration is the backup.
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;

CREATE OR REPLACE FUNCTION public.fitness_standard_owner_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
    SELECT '6f471a6f-3697-4826-a0d8-34404ea5980d'::uuid;
$$;

-- Profiles: anon sees nothing. Logged-in users see themselves always, and other
-- people only when those people have not chosen hidden.
-- Any leftover permissive policy would OR with these and reopen the table,
-- so every existing profiles policy is dropped first.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
    FOR r IN
        SELECT policyname FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'profiles'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
    END LOOP;
END $$;

CREATE POLICY profiles_select_visible ON public.profiles
    FOR SELECT TO authenticated
    USING (id = auth.uid() OR coalesce(is_hidden, false) = false);
CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (id = auth.uid());

REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- Exercises and routines: drop policies that include anon or PUBLIC (those OR
-- with the tighter rules and were letting the anon key read personal lifts),
-- then ensure the standard-library + own-rows policies exist.
DO $$
DECLARE r record;
    tbl text;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['exercises', 'routines']
    LOOP
        IF to_regclass('public.' || tbl) IS NULL THEN
            CONTINUE;
        END IF;
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);
        FOR r IN
            SELECT policyname, roles::text AS roles_text
            FROM pg_policies
            WHERE schemaname = 'public' AND tablename = tbl
              AND (roles::text LIKE '%anon%' OR roles::text LIKE '%public%')
        LOOP
            EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, tbl);
        END LOOP;
    END LOOP;
END $$;

-- Any logged-in user can read every exercise. Friends store each other's
-- custom exercise ids on their own routines and workout_logs, and the gym
-- resolves those ids from this list. Writes stay own-row only. Anon is
-- blocked by the revoke below, not by this policy.
DROP POLICY IF EXISTS exercises_select ON public.exercises;
DROP POLICY IF EXISTS exercises_insert ON public.exercises;
DROP POLICY IF EXISTS exercises_update ON public.exercises;
DROP POLICY IF EXISTS exercises_delete ON public.exercises;
CREATE POLICY exercises_select ON public.exercises
    FOR SELECT TO authenticated
    USING (true);
CREATE POLICY exercises_insert ON public.exercises
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY exercises_update ON public.exercises
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY exercises_delete ON public.exercises
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS routines_select ON public.routines;
DROP POLICY IF EXISTS routines_insert ON public.routines;
DROP POLICY IF EXISTS routines_update ON public.routines;
DROP POLICY IF EXISTS routines_delete ON public.routines;
CREATE POLICY routines_select ON public.routines
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR user_id = public.fitness_standard_owner_id()
    );
CREATE POLICY routines_insert ON public.routines
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());
CREATE POLICY routines_update ON public.routines
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
CREATE POLICY routines_delete ON public.routines
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());

-- Tables that currently have RLS off. Own-row when there is a user_id,
-- otherwise authenticated read-only (shared catalog, no writes).
-- Does not drop tables or rows.
DO $$
DECLARE
    r record;
    has_user boolean;
    pol text;
BEGIN
    FOR r IN
        SELECT c.relname
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public'
          AND c.relkind = 'r'
          AND c.relrowsecurity = false
          AND c.relname NOT LIKE 'pg_%'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.relname);
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = r.relname
              AND column_name = 'user_id'
        ) INTO has_user;
        pol := r.relname || '_rls_owner';
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol, r.relname);
        IF has_user THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())',
                pol, r.relname
            );
        ELSE
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (true)',
                pol, r.relname
            );
        END IF;
    END LOOP;
END $$;

-- Leaderboard is a security-definer view on purpose. security_invoker would
-- hide other athletes, because workout_logs is per-user RLS, and the Arena
-- would go empty. Keep the definer view, take it away from anon.
-- It already excludes is_hidden profiles (checked against live data).
DO $$
DECLARE kind "char";
BEGIN
    SELECT c.relkind INTO kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'leaderboard';
    IF kind IS NULL THEN
        RAISE NOTICE 'leaderboard is missing — skip';
        RETURN;
    END IF;
    IF kind = 'v' THEN
        EXECUTE 'ALTER VIEW public.leaderboard SET (security_invoker = false)';
    END IF;
    EXECUTE 'REVOKE ALL ON TABLE public.leaderboard FROM PUBLIC, anon';
    EXECUTE 'GRANT SELECT ON TABLE public.leaderboard TO authenticated';
END $$;

-- Nutrition totals: each logged-in user sees only their own rows.
-- Anon gets no grant. Safe to re-run: the auth.uid() filter is added once.
DO $$
DECLARE
    kind "char";
    def text;
BEGIN
    SELECT c.relkind INTO kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'daily_nutrition_totals';
    IF kind IS NULL THEN
        RAISE NOTICE 'daily_nutrition_totals is missing — skip';
        RETURN;
    END IF;
    IF kind = 'v' THEN
        def := btrim(pg_get_viewdef('public.daily_nutrition_totals'::regclass, true));
        def := regexp_replace(def, ';[[:space:]]*$', '');
        IF def NOT ILIKE '%auth.uid()%' THEN
            EXECUTE
                'CREATE OR REPLACE VIEW public.daily_nutrition_totals '
                || 'WITH (security_invoker = true, security_barrier = true) AS '
                || 'SELECT * FROM (' || def || ') AS nutrition_totals '
                || 'WHERE user_id = auth.uid()';
        ELSE
            EXECUTE 'ALTER VIEW public.daily_nutrition_totals SET (security_invoker = true, security_barrier = true)';
        END IF;
    END IF;
    EXECUTE 'REVOKE ALL ON TABLE public.daily_nutrition_totals FROM PUBLIC, anon';
    EXECUTE 'GRANT SELECT ON TABLE public.daily_nutrition_totals TO authenticated';
END $$;

-- Belt and suspenders: the anon API role should not have table privileges in public.
-- Authenticated grants are left as they are. service_role is untouched.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Future tables, sequences, and functions created by the role that runs this
-- script (postgres, in the SQL editor) must not be granted to anon again.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;

COMMIT;
