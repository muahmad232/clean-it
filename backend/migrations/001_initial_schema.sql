-- ============================================================
-- Agentic Self-Healing Data Pipeline
-- Schema: data-agent
-- Run this in Supabase SQL Editor
-- ============================================================

-- Create dedicated schema (separate from public)
CREATE SCHEMA IF NOT EXISTS "data_agent";

-- Grant usage to supabase roles
GRANT USAGE ON SCHEMA "data_agent" TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "data_agent"
    GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA "data_agent"
    GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- ── projects ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "data_agent".projects (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id
    ON "data_agent".projects (user_id);

COMMENT ON TABLE "data_agent".projects IS
    'Top-level container grouping related datasets together.';

-- ── datasets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "data_agent".datasets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id        UUID NOT NULL REFERENCES "data_agent".projects(id) ON DELETE CASCADE,

    original_filename TEXT NOT NULL,
    storage_path      TEXT,          -- path in Supabase Storage (set after upload)

    file_type         TEXT NOT NULL DEFAULT 'csv'
                        CHECK (file_type IN ('csv', 'json', 'parquet')),
    file_size         BIGINT,

    row_count         INTEGER,
    column_count      INTEGER,

    task_type         TEXT NOT NULL DEFAULT 'GENERAL'
                        CHECK (task_type IN ('GENERAL','CLASSIFICATION','REGRESSION','CLUSTERING','LLM_FINETUNING')),
    target_column     TEXT,

    status            TEXT NOT NULL DEFAULT 'PENDING_UPLOAD'
                        CHECK (status IN ('PENDING_UPLOAD','UPLOADED','PROCESSING','COMPLETED','FAILED')),

    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_datasets_project_id
    ON "data_agent".datasets (project_id);

COMMENT ON TABLE "data_agent".datasets IS
    'Metadata for each uploaded dataset. Actual file bytes live in Supabase Storage.';

-- ── Auto-update updated_at ────────────────────────────────────────
CREATE OR REPLACE FUNCTION "data_agent".set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON "data_agent".projects
    FOR EACH ROW EXECUTE FUNCTION "data_agent".set_updated_at();

CREATE OR REPLACE TRIGGER trg_datasets_updated_at
    BEFORE UPDATE ON "data_agent".datasets
    FOR EACH ROW EXECUTE FUNCTION "data_agent".set_updated_at();
