-- BA Fitness: scoped protocol library (standard + personal)
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)
--
-- Requires fitness_standard_owner_id() from exercises_schema.sql (or defined below).

CREATE OR REPLACE FUNCTION public.fitness_standard_owner_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT '6f471a6f-3697-4826-a0d8-34404ea5980d'::uuid;
$$;

-- Dedupe standard protocols: keep oldest row per normalized name
DO $$
DECLARE
    rec RECORD;
    keeper_id uuid;
BEGIN
    FOR rec IN
        SELECT lower(trim(name)) AS norm_name, array_agg(id ORDER BY created_at NULLS LAST, id) AS ids
        FROM routines
        WHERE user_id = public.fitness_standard_owner_id()
        GROUP BY lower(trim(name))
        HAVING count(*) > 1
    LOOP
        keeper_id := rec.ids[1];

        UPDATE schedule s
        SET routine_id = keeper_id
        WHERE routine_id = ANY(rec.ids[2:]);

        DELETE FROM routines WHERE id = ANY(rec.ids[2:]);
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS routines_standard_name_unique
    ON routines (lower(trim(name)))
    WHERE user_id = public.fitness_standard_owner_id();

ALTER TABLE routines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "routines_select" ON routines;
DROP POLICY IF EXISTS "routines_insert" ON routines;
DROP POLICY IF EXISTS "routines_update" ON routines;
DROP POLICY IF EXISTS "routines_delete" ON routines;

-- Standard protocols + own personal protocols only
CREATE POLICY "routines_select" ON routines
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR user_id = public.fitness_standard_owner_id()
    );

CREATE POLICY "routines_insert" ON routines
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "routines_update" ON routines
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "routines_delete" ON routines
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());
