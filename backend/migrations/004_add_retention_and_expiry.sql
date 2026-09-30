-- ============================================================
-- Migration 004: 10-Day Dataset Retention & Expiration
-- Schema: data-agent
-- ============================================================

-- Add expires_at column defaulting to 10 days from creation
ALTER TABLE "data_agent".datasets
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 days');

-- Backfill any existing datasets without expires_at
UPDATE "data_agent".datasets
SET expires_at = created_at + interval '10 days'
WHERE expires_at IS NULL;

-- Index for efficient expired query cleanup
CREATE INDEX IF NOT EXISTS idx_datasets_expires_at
ON "data_agent".datasets (expires_at);

-- Add index on user_id in projects
CREATE INDEX IF NOT EXISTS idx_projects_user_id
ON "data_agent".projects (user_id);
