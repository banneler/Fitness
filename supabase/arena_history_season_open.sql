-- One-time: allow season_open events + backfill opening board snapshot
-- Safe to re-run only on an empty arena_rank_events table

ALTER TABLE arena_rank_events DROP CONSTRAINT IF EXISTS arena_rank_events_event_type_check;
ALTER TABLE arena_rank_events ADD CONSTRAINT arena_rank_events_event_type_check
    CHECK (event_type IN ('crown_change', 'rank_change', 'entered', 'season_open'));

-- Opening standings (entered) — slightly older so season_open pins to top
INSERT INTO arena_rank_events (event_type, metric, user_id, new_rank, created_at) VALUES
    ('entered', 'volume', '3b55ebc1-3d61-4a5e-b8f5-a2e12d191bd7', 1, now() - interval '2 minutes'),
    ('entered', 'volume', '6f471a6f-3697-4826-a0d8-34404ea5980d', 2, now() - interval '2 minutes'),
    ('entered', 'volume', '05527981-12e8-45d7-9a46-b0ae007b0346', 3, now() - interval '2 minutes'),
    ('entered', 'volume', 'ec3fe64b-9c56-4eda-b6a5-8f29b39b97f9', 4, now() - interval '2 minutes'),
    ('entered', 'sessions', '6f471a6f-3697-4826-a0d8-34404ea5980d', 1, now() - interval '2 minutes'),
    ('entered', 'sessions', '3b55ebc1-3d61-4a5e-b8f5-a2e12d191bd7', 2, now() - interval '2 minutes'),
    ('entered', 'sessions', '05527981-12e8-45d7-9a46-b0ae007b0346', 3, now() - interval '2 minutes'),
    ('entered', 'sessions', 'ec3fe64b-9c56-4eda-b6a5-8f29b39b97f9', 4, now() - interval '2 minutes'),
    ('entered', 'streak', '6f471a6f-3697-4826-a0d8-34404ea5980d', 1, now() - interval '2 minutes'),
    ('entered', 'streak', '3b55ebc1-3d61-4a5e-b8f5-a2e12d191bd7', 2, now() - interval '2 minutes'),
    ('entered', 'streak', '05527981-12e8-45d7-9a46-b0ae007b0346', 3, now() - interval '2 minutes'),
    ('entered', 'streak', 'ec3fe64b-9c56-4eda-b6a5-8f29b39b97f9', 4, now() - interval '2 minutes');

INSERT INTO arena_rank_events (event_type, metric, new_leader_id, created_at) VALUES
    ('season_open', 'volume', '3b55ebc1-3d61-4a5e-b8f5-a2e12d191bd7', now()),
    ('season_open', 'sessions', '6f471a6f-3697-4826-a0d8-34404ea5980d', now()),
    ('season_open', 'streak', '6f471a6f-3697-4826-a0d8-34404ea5980d', now());
