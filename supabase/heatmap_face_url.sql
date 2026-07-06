-- Separate face crop for muscle heatmap (distinct from profile avatar_url)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS heatmap_face_url text;
