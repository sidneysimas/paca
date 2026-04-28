-- 000002_add_story_points.sql
-- Adds the story_points column to the tasks table (v0.2.0).

BEGIN;

ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS story_points INTEGER CHECK (story_points IS NULL OR story_points >= 0);

COMMIT;
