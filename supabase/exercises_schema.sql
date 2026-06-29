-- BA Fitness: scoped exercise library (standard + personal) + workout log exercise_id
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)
--
-- Standard library owner: Bryan Anneler (BA). Exercises with this user_id are global.
-- All other exercises are private to their creator.

CREATE OR REPLACE FUNCTION public.fitness_standard_owner_id()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT '6f471a6f-3697-4826-a0d8-34404ea5980d'::uuid;
$$;

-- Link workout logs to exercise UUIDs (name kept for display / legacy reads)
ALTER TABLE workout_logs
    ADD COLUMN IF NOT EXISTS exercise_id uuid REFERENCES exercises(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS workout_logs_exercise_id_idx
    ON workout_logs (user_id, exercise_id);

CREATE INDEX IF NOT EXISTS workout_logs_user_exercise_name_idx
    ON workout_logs (user_id, exercise_name);

-- Backfill exercise_id from matching library entries (personal first, then standard)
UPDATE workout_logs wl
SET exercise_id = e.id
FROM exercises e
WHERE wl.exercise_id IS NULL
  AND wl.user_id = e.user_id
  AND lower(trim(wl.exercise_name)) = lower(trim(e.name));

UPDATE workout_logs wl
SET exercise_id = e.id
FROM exercises e
WHERE wl.exercise_id IS NULL
  AND e.user_id = public.fitness_standard_owner_id()
  AND lower(trim(wl.exercise_name)) = lower(trim(e.name));

-- Dedupe standard-library exercises: keep oldest row per normalized name
DO $$
DECLARE
    rec RECORD;
    keeper_id uuid;
BEGIN
    FOR rec IN
        SELECT lower(trim(name)) AS norm_name, array_agg(id ORDER BY created_at NULLS LAST, id) AS ids
        FROM exercises
        WHERE user_id = public.fitness_standard_owner_id()
        GROUP BY lower(trim(name))
        HAVING count(*) > 1
    LOOP
        keeper_id := rec.ids[1];

        UPDATE routines r
        SET exercise_order = (
            SELECT coalesce(array_agg(CASE WHEN x = ANY(rec.ids[2:]) THEN keeper_id ELSE x END), '{}')
            FROM unnest(r.exercise_order) AS x
        )
        WHERE exercise_order && rec.ids[2:];

        UPDATE workout_logs wl
        SET exercise_id = keeper_id
        WHERE exercise_id = ANY(rec.ids[2:]);

        DELETE FROM exercises WHERE id = ANY(rec.ids[2:]);
    END LOOP;
END $$;

-- One canonical name per standard exercise (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS exercises_standard_name_unique
    ON exercises (lower(trim(name)))
    WHERE user_id = public.fitness_standard_owner_id();

ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercises_select" ON exercises;
DROP POLICY IF EXISTS "exercises_insert" ON exercises;
DROP POLICY IF EXISTS "exercises_update" ON exercises;
DROP POLICY IF EXISTS "exercises_delete" ON exercises;

-- Standard library + own personal exercises only
CREATE POLICY "exercises_select" ON exercises
    FOR SELECT TO authenticated
    USING (
        user_id = auth.uid()
        OR user_id = public.fitness_standard_owner_id()
    );

CREATE POLICY "exercises_insert" ON exercises
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "exercises_update" ON exercises
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "exercises_delete" ON exercises
    FOR DELETE TO authenticated
    USING (user_id = auth.uid());
