-- One finished workout = one session_id across all exercise log rows.
-- Fixes Tracker/Recap merging neighboring workouts within the old 60-minute window.
-- Run once in Supabase SQL Editor (Dashboard → SQL → New query)

ALTER TABLE workout_logs
    ADD COLUMN IF NOT EXISTS session_id uuid;

CREATE INDEX IF NOT EXISTS workout_logs_user_session_idx
    ON workout_logs (user_id, session_id, created_at DESC);

COMMENT ON COLUMN workout_logs.session_id IS
    'Shared id for every exercise log written by one Finish action. Used to group sessions without time-window merging.';
