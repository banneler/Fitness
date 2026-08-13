-- Recovery mode: log the session, but skip it when loading previous working weights.
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)

ALTER TABLE workout_logs
    ADD COLUMN IF NOT EXISTS is_recovery boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS workout_logs_user_exercise_working_idx
    ON workout_logs (user_id, exercise_id, created_at DESC)
    WHERE is_recovery = false;

COMMENT ON COLUMN workout_logs.is_recovery IS
    'When true, session was a recovery workout: kept for history but ignored for previous-weight preload.';
